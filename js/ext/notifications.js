/* Myra V33 — Notifications push en temps réel, même application fermée (ordinateur et téléphone) */
(() => {
  const X = window.MyraX, { EXT, A, esc, fdate } = X;
  X.menu('MON ESPACE', [['notifications', 'Notifications', 'fa-bell']]);
  const KINDS = [
    ['orders', 'Nouvelles commandes', 'Boutique en ligne et commandes saisies par l’équipe', 'fa-bag-shopping'],
    ['sales', 'Ventes confirmées', 'Ventes enregistrées sur un autre appareil', 'fa-cash-register'],
    ['payments', 'Paiements reçus', 'Règlements de factures en attente', 'fa-money-bill-wave'],
    ['reviews', 'Avis clients', 'Quand un client note sa commande', 'fa-star'],
    ['stock', 'Stock bas et ruptures', 'Quand un produit passe sous son seuil d’alerte', 'fa-triangle-exclamation']
  ];
  const DISMISS = 'myra_push_ask_later';
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const device = () => {
    const os = isIOS ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
    const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return `${os}${br ? ' · ' + br : ''}${standalone ? ' · application installée' : ''}`;
  };
  const b64ToBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  const keyB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function registration() { const r = await navigator.serviceWorker.getRegistration(); return r || navigator.serviceWorker.register('./sw.js'); }
  async function currentSub() { if (!supported()) return null; try { return await (await registration()).pushManager.getSubscription(); } catch (_) { return null; } }
  async function invoke(app, body) {
    const { data, error } = await app.sb.functions.invoke('myra-push', { body });
    if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch (_) {} throw new Error(msg); }
    if (data?.error) throw new Error(data.error); return data;
  }
  async function save(app, sub, prefs) {
    const j = sub.toJSON(); const { error } = await app.sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: device(), p_prefs: prefs || null });
    if (error) throw error;
  }
  async function enable(app) {
    if (!supported()) throw new Error(isIOS && !standalone ? 'Sur iPhone, ouvrez d’abord l’application depuis son icône sur l’écran d’accueil.' : 'Ce navigateur ne gère pas les notifications.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Les notifications sont bloquées pour cette application. Autorisez-les dans les réglages du navigateur (icône 🔒 à gauche de l’adresse) ou du téléphone, puis réessayez.' : 'Autorisation non accordée.');
    const reg = await registration(); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) { const { publicKey } = await invoke(app, { action: 'public_key' }); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }); }
    await save(app, sub);
    try { localStorage.removeItem(DISMISS); } catch (_) {}
    return sub;
  }

  EXT.pages.notifications = {
    title: 'Notifications',
    async render(host, app) {
      X.loading(host);
      const sub = await currentSub(); const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      let mine = [], row = null;
      try { const { data, error } = await app.sb.from('push_subscriptions').select('id,endpoint,device,prefs,created_at,last_success_at').order('created_at', { ascending: false }); if (error) throw error; mine = data || []; }
      catch (e) { if (X.isMissing(e)) { host.innerHTML = X.head('Notifications', 'Soyez prévenu(e) en temps réel, même application fermée.') + '<div class="panel ext-error"><h3><i class="fa-solid fa-puzzle-piece"></i> Notifications pas encore activées</h3><p class="muted">Exécutez une seule fois <code>supabase/myra_v33_notifications.sql</code> dans Supabase › SQL Editor.</p></div>'; return; } return X.errorPanel(host, e); }
      if (sub) row = mine.find(m => m.endpoint === sub.endpoint) || null;
      const on = !!(sub && row && perm === 'granted');
      const prefs = { orders: true, sales: true, payments: true, reviews: true, stock: true, ...(row?.prefs || {}) };
      let state;
      if (!supported()) state = isIOS && !standalone
        ? `<div class="notif-state warn"><i class="fa-solid fa-mobile-screen"></i><div><b>Sur iPhone / iPad : installez d’abord l’application</b><p>Dans Safari, touchez <b>Partager</b> <i class="fa-solid fa-arrow-up-from-bracket"></i> puis <b>Sur l’écran d’accueil</b>. Ouvrez ensuite Myra depuis cette icône et revenez ici (iOS 16.4 ou plus récent).</p></div></div>`
        : `<div class="notif-state bad"><i class="fa-solid fa-ban"></i><div><b>Ce navigateur ne gère pas les notifications</b><p>Utilisez Chrome, Edge, Firefox ou Safari récent.</p></div></div>`;
      else if (perm === 'denied') state = `<div class="notif-state bad"><i class="fa-solid fa-bell-slash"></i><div><b>Notifications bloquées sur cet appareil</b><p>Ordinateur : cliquez sur l’icône 🔒 à gauche de l’adresse › Notifications › Autoriser. Android : appui long sur l’icône Myra › Infos sur l’appli › Notifications. iPhone : Réglages › Notifications › Myra. Puis rechargez la page.</p></div></div>`;
      else if (on) state = `<div class="notif-state ok"><i class="fa-solid fa-bell"></i><div><b>Activées sur cet appareil</b><p>${esc(row.device || device())}${row.last_success_at ? ' · dernière notification ' + fdate(row.last_success_at) : ''}</p></div><div class="actions"><button type="button" class="btn light" id="ntTest"><i class="fa-solid fa-paper-plane"></i> Tester</button><button type="button" class="btn light" id="ntOff"><i class="fa-solid fa-bell-slash"></i> Désactiver</button></div></div>`;
      else state = `<div class="notif-state"><i class="fa-regular fa-bell"></i><div><b>Pas encore activées sur cet appareil</b><p>Recevez une alerte dès qu’une commande arrive, comme un message, même quand Myra est fermée.</p></div><div class="actions"><button type="button" class="btn primary" id="ntOn"><i class="fa-solid fa-bell"></i> Activer sur cet appareil</button></div></div>`;

      host.innerHTML = X.head('Notifications', 'Soyez prévenu(e) en temps réel, même quand l’application est fermée. À activer sur chaque appareil : ordinateur et téléphone.')
        + `<section class="card">${state}</section>`
        + (on ? `<section class="card"><div class="card-head"><h3>Me prévenir pour…</h3><span class="muted">sur cet appareil</span></div>${KINDS.map(([k, t, d, i]) => `<label class="notif-pref"><span class="notif-ico"><i class="fa-solid ${i}"></i></span><span><b>${t}</b><small>${d}</small></span><input type="checkbox" class="switch" data-pref="${k}" ${prefs[k] !== false ? 'checked' : ''}></label>`).join('')}<p class="muted" style="margin:10px 0 0">Vous n’êtes jamais notifié(e) de vos propres actions. Certains types dépendent de votre rôle (ex. paiements : direction et comptabilité).</p></section>` : '')
        + `<section class="card"><div class="card-head"><h3>Mes appareils</h3><span class="muted">${mine.length} appareil(s)</span></div>${mine.length ? mine.map(m => `<div class="m-row"><span class="m-txt"><b>${esc(m.device || 'Appareil')}${sub && m.endpoint === sub.endpoint ? ' <span class="tone ok">cet appareil</span>' : ''}</b><small>Ajouté le ${fdate(m.created_at)}${m.last_success_at ? ' · dernière notification ' + fdate(m.last_success_at) : ''}</small></span><button type="button" class="btn light sm" data-del="${esc(m.id)}" aria-label="Retirer"><i class="fa-solid fa-trash-can"></i></button></div>`).join('') : '<p class="muted">Aucun appareil. Activez les notifications sur votre ordinateur, puis ouvrez Myra sur votre téléphone et faites de même.</p>'}</section>`;

      const busy = (b, label) => { b.disabled = true; b.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${label}`; };
      host.querySelector('#ntOn')?.addEventListener('click', async e => {
        busy(e.currentTarget, 'Activation…');
        try { await enable(app); try { await invoke(app, { action: 'test', endpoint: (await currentSub())?.endpoint }); } catch (_) {} app.toast('Notifications activées sur cet appareil.'); }
        catch (err) { app.toast(err.message || X.explain(err), true); }
        EXT.pages.notifications.render(host, app);
      });
      host.querySelector('#ntTest')?.addEventListener('click', async e => {
        busy(e.currentTarget, 'Envoi…');
        try { const r = await invoke(app, { action: 'test', endpoint: sub.endpoint }); app.toast(r.sent ? 'Notification envoyée : elle arrive dans quelques secondes.' : 'L’envoi a échoué. Désactivez puis réactivez les notifications.', !r.sent); }
        catch (err) { app.toast(err.message, true); }
        EXT.pages.notifications.render(host, app);
      });
      host.querySelector('#ntOff')?.addEventListener('click', async () => {
        try { await app.sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); app.toast('Notifications désactivées sur cet appareil.'); }
        catch (err) { app.toast(X.explain(err), true); }
        EXT.pages.notifications.render(host, app);
      });
      host.querySelectorAll('[data-pref]').forEach(c => c.onchange = async () => {
        prefs[c.dataset.pref] = c.checked;
        const { error } = await app.sb.from('push_subscriptions').update({ prefs, updated_at: new Date().toISOString() }).eq('endpoint', sub.endpoint);
        if (error) { c.checked = !c.checked; return app.toast(X.explain(error), true); } app.toast('Préférence enregistrée.');
      });
      host.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const m = mine.find(x => x.id === b.dataset.del);
        const { error } = await app.sb.from('push_subscriptions').delete().eq('id', m.id); if (error) return app.toast(X.explain(error), true);
        if (sub && m.endpoint === sub.endpoint) try { await sub.unsubscribe(); } catch (_) {}
        app.toast('Appareil retiré.'); EXT.pages.notifications.render(host, app);
      });
    }
  };

  /* Ouverture depuis une notification : aller directement au bon écran */
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', async e => {
    const app = A();
    if (e.data?.type === 'myra-open') { const page = (new URL(e.data.url).hash || '').replace(/^#\/?/, ''); if (page && app?.navigate) app.navigate(page); }
    if (e.data?.type === 'myra-resubscribe' && app?.state?.user && Notification.permission === 'granted') { try { await enable(app); } catch (_) {} }
  });

  /* Au démarrage : garder l'abonnement à jour, et proposer l'activation une fois (pas plus d'une fois par 2 semaines) */
  X.whenReady(async app => {
    if (!app?.state?.user || !supported() || !navigator.onLine) return;
    const perm = Notification.permission;
    if (perm === 'granted') { const s = await currentSub(); if (s) { try { await save(app, s); } catch (_) {} return; } }
    if (perm === 'denied' || document.getElementById('ntAsk')) return;
    let later = 0; try { later = Number(localStorage.getItem(DISMISS) || 0); } catch (_) {}
    if (Date.now() - later < 14 * 864e5) return;
    const bar = document.createElement('div'); bar.id = 'ntAsk'; bar.className = 'notif-ask'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Activer les notifications');
    bar.innerHTML = `<span class="notif-ico"><i class="fa-solid fa-bell"></i></span><div><b>Être prévenu(e) des nouvelles commandes ?</b><small>Même quand Myra est fermée, sur cet appareil.</small></div><button type="button" class="btn primary sm" data-yes>Activer</button><button type="button" class="icon-action" data-no aria-label="Plus tard"><i class="fa-solid fa-xmark"></i></button>`;
    document.body.appendChild(bar);
    bar.querySelector('[data-no]').onclick = () => { try { localStorage.setItem(DISMISS, String(Date.now())); } catch (_) {} bar.remove(); };
    bar.querySelector('[data-yes]').onclick = async () => {
      bar.remove();
      try { await enable(app); try { await invoke(app, { action: 'test', endpoint: (await currentSub())?.endpoint }); } catch (_) {} app.toast('Notifications activées sur cet appareil.'); }
      catch (err) { app.toast(err.message || X.explain(err), true); try { localStorage.setItem(DISMISS, String(Date.now())); } catch (_) {} }
    };
  });
})();
