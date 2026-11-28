/* Myra V36 — Centre de notifications : historique (base de données, temps réel), lu / non lu par personne,
   onglets, filtre par type, tri, alertes « à traiter ». Une seule source (MyraNotif) pour la cloche et la page. */
(() => {
  const X = window.MyraX, { A, esc } = X;
  const KINDS = {
    orders: ['Commandes', 'fa-bag-shopping', 'k-or'], sales: ['Ventes', 'fa-cash-register', 'k-sa'], payments: ['Paiements', 'fa-money-bill-wave', 'k-pa'],
    reviews: ['Avis clients', 'fa-star', 'k-re'], stock: ['Stock', 'fa-triangle-exclamation', 'k-st'], team: ['Équipe', 'fa-user-plus', 'k-sy'], test: ['Système', 'fa-bell', 'k-sy']
  };
  const kindOf = k => KINDS[k] || ['Autres', 'fa-bell', 'k-sy'];
  const VIEW_KEY = 'myra_notif_view';
  const view = (() => { try { return { tab: 'all', kind: '', sort: 'new', ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') }; } catch (_) { return { tab: 'all', kind: '', sort: 'new' }; } })();
  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (_) {} };
  const S = { items: [], alerts: [], ready: false, missing: false, uid: null, channel: null, panels: new Set() };
  const cacheKey = () => 'myra_notif_cache:' + S.uid;

  const rel = iso => {
    const d = new Date(iso), s = (Date.now() - d) / 1000;
    if (s < 60) return 'à l’instant'; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`; if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 7 * 86400) return d.toLocaleDateString('fr-FR', { weekday: 'long' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };
  const dayLabel = iso => {
    const d = new Date(iso), t = new Date(); const k = x => x.toISOString().slice(0, 10);
    const y = new Date(t); y.setDate(t.getDate() - 1);
    return k(d) === k(t) ? 'Aujourd’hui' : k(d) === k(y) ? 'Hier' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const unread = () => S.items.filter(n => !n.read).length;

  function badge() {
    const n = unread(), b = document.getElementById('bellBadge'), btn = document.getElementById('bellBtn');
    if (b) { b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('hidden', !n); }
    btn?.setAttribute('aria-label', n ? `Notifications : ${n} non lue${n > 1 ? 's' : ''}` : 'Notifications');
    btn?.classList.toggle('has-alerts', !n && S.alerts.length > 0);
    try { if ('setAppBadge' in navigator) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (_) {}
  }
  const rerender = () => { badge(); S.panels.forEach(p => p.host.isConnected ? render(p.host, p.opts) : S.panels.delete(p)); };

  async function load() {
    const app = A(); if (!app?.sb || !app.state?.user) return;
    S.uid = app.state.user.id;
    if (!navigator.onLine) { try { S.items = JSON.parse(localStorage.getItem(cacheKey()) || '[]'); } catch (_) {} S.ready = true; return rerender(); }
    const { data, error } = await app.sb.from('app_notifications').select('id,kind,title,body,url,tag,created_at,app_notification_reads(read_at)').order('created_at', { ascending: false }).limit(300);
    if (error) { S.missing = X.isMissing(error); S.ready = true; return rerender(); }
    S.items = (data || []).map(n => ({ ...n, read: !!(n.app_notification_reads || []).length, app_notification_reads: undefined }));
    S.ready = true; S.missing = false;
    try { localStorage.setItem(cacheKey(), JSON.stringify(S.items.slice(0, 150))); } catch (_) {}
    rerender(); live();
  }
  /* V41 : petit son quand une commande, une vente ou un paiement arrive, application ouverte (réglable dans Notifications) */
  window.MyraSound = {
    pref() { try { return { on: true, volume: 0.6, ...JSON.parse(localStorage.getItem('myra_sound') || '{}') }; } catch (_) { return { on: true, volume: 0.6 }; } },
    set(p) { try { localStorage.setItem('myra_sound', JSON.stringify({ ...this.pref(), ...p })); } catch (_) {} },
    ctx: null,
    play(kind, force) {
      const p = this.pref(); if (!force && (!p.on || !['orders', 'sales', 'payments', 'reviews', 'team'].includes(kind))) return;
      try {
        const C = window.AudioContext || window.webkitAudioContext; if (!C) return; this.ctx = this.ctx || new C(); const ctx = this.ctx; if (ctx.state === 'suspended') ctx.resume();
        const notes = kind === 'payments' ? [880, 1175, 1568] : kind === 'orders' ? [784, 988, 1319, 1568] : [988, 1319];
        notes.forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); const t = ctx.currentTime + i * 0.13;
          o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.01, p.volume) * 0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
          o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3); });
        navigator.vibrate?.(kind === 'orders' ? [120, 60, 120, 60, 200] : [100, 50, 100]);
      } catch (_) {}
    }
  };
  // Les navigateurs n'autorisent le son qu'après un premier geste : on prépare le son au premier clic
  document.addEventListener('pointerdown', () => { try { const C = window.AudioContext || window.webkitAudioContext; if (C && !window.MyraSound.ctx) window.MyraSound.ctx = new C(); } catch (_) {} }, { once: true });

  function live() {
    const app = A(); if (S.channel || !app?.sb?.channel) return;
    S.channel = app.sb.channel('myra-notifs').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_notifications' }, ({ new: n }) => {
      if (!n || S.items.some(x => x.id === n.id)) return;
      S.items.unshift({ ...n, read: false }); rerender();
      const bell = document.getElementById('bellBtn'); bell?.classList.remove('ring'); void bell?.offsetWidth; bell?.classList.add('ring');
      if (n.actor !== app.state?.user?.id) window.MyraSound?.play(n.kind);
    }).subscribe();
  }
  async function setRead(ids, read) {
    const app = A(); ids = ids.filter(Boolean); if (!ids.length) return;
    S.items.forEach(n => { if (ids.includes(n.id)) n.read = read; }); rerender();
    if (!navigator.onLine) return;
    const q = read
      ? app.sb.from('app_notification_reads').upsert(ids.map(id => ({ notification_id: id, user_id: S.uid })), { onConflict: 'notification_id,user_id', ignoreDuplicates: true })
      : app.sb.from('app_notification_reads').delete().in('notification_id', ids).eq('user_id', S.uid);
    const { error } = await q; if (error) app.toast('Statut non enregistré : ' + X.explain(error), true);
  }
  async function markAll() {
    const app = A(); S.items.forEach(n => { n.read = true; }); rerender();
    const { error } = await app.sb.rpc('mark_all_notifications_read'); if (error) app.toast(X.explain(error), true);
  }
  const go = url => { const page = String(url || '').split('#/')[1]; if (page) A().navigate(page.split('?')[0]); };

  function filtered() {
    let list = S.items.filter(n => (view.tab === 'unread' ? !n.read : view.tab === 'read' ? n.read : true) && (!view.kind || n.kind === view.kind));
    const by = { new: (a, b) => b.created_at.localeCompare(a.created_at), old: (a, b) => a.created_at.localeCompare(b.created_at),
      unread: (a, b) => (a.read - b.read) || b.created_at.localeCompare(a.created_at), kind: (a, b) => kindOf(a.kind)[0].localeCompare(kindOf(b.kind)[0]) || b.created_at.localeCompare(a.created_at) };
    return list.sort(by[view.sort] || by.new);
  }

  function itemHtml(n) {
    const [label, ico, cls] = kindOf(n.kind);
    return `<div class="nc-item ${n.read ? '' : 'unread'}" data-id="${esc(n.id)}">
      <button type="button" class="nc-main" data-open="${esc(n.id)}"><span class="nc-ico ${cls}"><i class="fa-solid ${ico}" aria-hidden="true"></i></span>
        <span class="nc-txt"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<em>${esc(label)} · ${esc(rel(n.created_at))}</em></span></button>
      <button type="button" class="nc-toggle" data-toggle="${esc(n.id)}" title="${n.read ? 'Marquer comme non lue' : 'Marquer comme lue'}" aria-label="${n.read ? 'Marquer comme non lue' : 'Marquer comme lue'}"><i class="${n.read ? 'fa-regular fa-circle' : 'fa-solid fa-circle'}" aria-hidden="true"></i></button></div>`;
  }

  function render(host, opts = {}) {
    const page = opts.mode === 'page'; const limit = page ? (opts.limit || 60) : 25;
    if (!S.panels.has(opts._ref) && opts._ref) S.panels.add(opts._ref);
    const all = S.items.length, un = unread();
    const tabs = [['all', 'Toutes', all], ['unread', 'Non lues', un], ['read', 'Lues', all - un], ['todo', 'À traiter', S.alerts.length]];
    const kinds = [...new Set(S.items.map(n => n.kind))];
    let body;
    if (!S.ready) body = '<div class="nc-empty"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement…</div>';
    else if (view.tab === 'todo') body = S.alerts.length ? S.alerts.map((a, i) => `<button type="button" class="nc-alert ${esc(a.tone || '')}" data-alert="${i}" ${a.go ? '' : 'disabled'}><span class="nc-ico"><i class="fa-solid ${esc(a.icon)}" aria-hidden="true"></i></span><span class="nc-txt"><b>${esc(a.title)}</b><small>${esc(a.text || '')}</small></span>${a.go ? '<i class="fa-solid fa-chevron-right nc-chev" aria-hidden="true"></i>' : ''}</button>`).join('')
      : '<div class="nc-empty"><span class="nc-big ok"><i class="fa-solid fa-circle-check"></i></span><b>Tout est en ordre</b><p>Aucun point à traiter pour le moment.</p></div>';
    else if (S.missing) body = '<div class="nc-empty"><b>Historique pas encore activé</b><p>Exécutez <code>supabase/myra_v36.sql</code> dans Supabase.</p></div>';
    else {
      const list = filtered(); const shown = list.slice(0, limit); let last = '';
      body = shown.length ? shown.map(n => { const d = view.sort === 'kind' ? kindOf(n.kind)[0] : dayLabel(n.created_at); const h = d !== last ? `<div class="nc-day">${esc(d)}</div>` : ''; last = d; return h + itemHtml(n); }).join('')
        + (list.length > shown.length ? `<button type="button" class="nc-more" data-more>${page ? `Afficher plus (${list.length - shown.length})` : `Voir les ${list.length - shown.length} autres`}</button>` : '')
        : `<div class="nc-empty"><span class="nc-big"><i class="fa-regular fa-bell"></i></span><b>${view.tab === 'unread' ? 'Aucune notification non lue' : view.tab === 'read' ? 'Aucune notification lue' : 'Aucune notification'}</b><p>${view.kind ? 'Essayez un autre type.' : 'Les nouvelles commandes, ventes, paiements, avis et alertes de stock apparaîtront ici.'}</p></div>`;
    }
    host.innerHTML = `<div class="nc ${page ? 'nc-page' : ''}">
      <div class="nc-head"><b>Notifications</b>${un ? `<button type="button" class="nc-link" data-all><i class="fa-solid fa-check-double" aria-hidden="true"></i> Tout marquer comme lu</button>` : '<span class="nc-ok">À jour</span>'}</div>
      <div class="nc-tabs" role="tablist" aria-label="Afficher">${tabs.map(([k, l, c]) => `<button type="button" role="tab" aria-selected="${view.tab === k}" class="${view.tab === k ? 'on' : ''}" data-tab="${k}">${l}${c ? ` <span>${c > 99 ? '99+' : c}</span>` : ''}</button>`).join('')}</div>
      ${view.tab === 'todo' ? '' : `<div class="nc-tools"><label><span class="sr">Type</span><select data-kind aria-label="Filtrer par type"><option value="">Tous les types</option>${kinds.map(k => `<option value="${esc(k)}" ${view.kind === k ? 'selected' : ''}>${esc(kindOf(k)[0])}</option>`).join('')}</select></label>
        <label><span class="sr">Tri</span><select data-sort aria-label="Trier"><option value="new" ${view.sort === 'new' ? 'selected' : ''}>Plus récentes</option><option value="old" ${view.sort === 'old' ? 'selected' : ''}>Plus anciennes</option><option value="unread" ${view.sort === 'unread' ? 'selected' : ''}>Non lues d’abord</option><option value="kind" ${view.sort === 'kind' ? 'selected' : ''}>Par type</option></select></label></div>`}
      <div class="nc-list">${body}</div>
      ${page ? '' : '<div class="nc-foot"><button type="button" data-page><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Historique complet et réglages</button></div>'}</div>`;
    const re = () => render(host, opts);
    host.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { view.tab = b.dataset.tab; saveView(); re(); });
    host.querySelector('[data-kind]')?.addEventListener('change', e => { view.kind = e.target.value; saveView(); re(); });
    host.querySelector('[data-sort]')?.addEventListener('change', e => { view.sort = e.target.value; saveView(); re(); });
    host.querySelector('[data-all]')?.addEventListener('click', markAll);
    host.querySelector('[data-more]')?.addEventListener('click', () => { if (page) { opts.limit = limit + 60; re(); } else { opts.onClose?.(); A().navigate('notifications'); } });
    host.querySelector('[data-page]')?.addEventListener('click', () => { opts.onClose?.(); A().navigate('notifications'); });
    host.querySelectorAll('[data-toggle]').forEach(b => b.onclick = e => { e.stopPropagation(); const n = S.items.find(x => x.id === b.dataset.toggle); setRead([n.id], !n.read); });
    host.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const n = S.items.find(x => x.id === b.dataset.open); if (!n.read) setRead([n.id], true); if (n.url) { opts.onClose?.(); go(n.url); } });
    host.querySelectorAll('[data-alert]').forEach(b => b.onclick = () => { const a = S.alerts[Number(b.dataset.alert)]; if (a?.go) { opts.onClose?.(); A().navigate(a.go); } });
  }

  window.MyraNotif = {
    load, render, badge, markAll, setRead,
    setAlerts(list) { S.alerts = list || []; rerender(); },
    panel(host, onClose, mode) { const ref = { host, opts: { onClose, mode } }; ref.opts._ref = ref; render(host, ref.opts); return ref; },
    get state() { return S; }
  };

  // Démarrage après connexion, rafraîchissement régulier et au retour de connexion
  let started = false;
  const start = () => { if (started || !A()?.state?.user) return; started = true; load(); setInterval(() => { if (document.visibilityState === 'visible') load(); }, 120000); };
  window.addEventListener('myra:navigate', start);
  window.addEventListener('online', () => { if (started) load(); });
  document.addEventListener('visibilitychange', () => { if (started && document.visibilityState === 'visible') load(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'myra-open' && started) load(); });
})();
