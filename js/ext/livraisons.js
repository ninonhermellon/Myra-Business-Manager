/* LSM Business Manager V39 — Suivi des livraisons (écran livreur), zones et frais de livraison par quartier,
   vérification des paiements Mobile Money et choix du livreur depuis la fiche commande. */
(() => {
  const X = window.MyraX, { EXT, A, esc, money } = X;
  const ST = { confirmed: ['Confirmée', 'info'], processing: ['En préparation', 'info'], ready: ['Prête', 'warn'], out_for_delivery: ['En route', 'warn'], delivered: ['Livrée', 'ok'] };
  const PAY = { mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', cash_on_delivery: 'À la livraison' };
  const PST = { unpaid: ['Non payé', 'off'], to_verify: ['À vérifier', 'off'], paid: ['Payé', 'on'], refused: ['Paiement introuvable', 'off'] };
  const isLead = () => ['owner', 'admin', 'manager', 'sales', 'employee'].includes(A()?.state?.profile?.role);
  const canAssign = () => ['owner', 'admin', 'manager', 'sales'].includes(A()?.state?.profile?.role);
  const tel = p => String(p || '').replace(/[^\d+]/g, '');

  X.menu('GESTION COMMERCIALE', [['deliveries', 'Livraisons', 'fa-motorcycle']]);
  X.menu('RELATION CLIENT', [['delivery_zones', 'Zones de livraison', 'fa-map-location-dot']], 2);

  /* Photo de preuve : réduite à 1280 px (JPEG) avant l'envoi */
  async function shrink(file) {
    const img = await createImageBitmap(file); const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  }
  async function uploadProof(app, file) {
    const blob = await shrink(file).catch(() => file);
    const path = `deliveries/${crypto.randomUUID()}/${Date.now()}.jpg`;
    const { error } = await app.sb.storage.from('myra-deliveries').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error; return path;
  }

  EXT.pages.deliveries = {
    title: 'Livraisons',
    async render(host, app) {
      let scope = isLead() && app.state.profile?.role !== 'driver' ? 'all' : 'mine'; let drivers = [];
      host.innerHTML = X.head('Livraisons', 'Votre tournée : appeler le client, itinéraire, preuve de livraison et argent encaissé.', isLead() ? `<div class="seg" role="group" aria-label="Livraisons affichées"><button type="button" data-scope="mine">Mes livraisons</button><button type="button" data-scope="all">Toutes</button></div>` : '')
        + '<div id="dvKpis"></div><div id="dvVerify"></div><div id="dvList"></div>';
      if (canAssign()) { const { data } = await app.sb.rpc('get_team_members'); drivers = (data || []).filter(p => p.is_active); }
      const segs = host.querySelectorAll('[data-scope]');
      const setSeg = () => segs.forEach(b => { b.classList.toggle('on', b.dataset.scope === scope); b.setAttribute('aria-pressed', String(b.dataset.scope === scope)); });
      segs.forEach(b => b.onclick = () => { scope = b.dataset.scope; setSeg(); load(); }); setSeg();
      async function verifyPanel() {
        const box = host.querySelector('#dvVerify'); if (!['owner', 'admin', 'manager', 'accountant', 'sales'].includes(app.state.profile?.role)) return;
        const { data } = await app.sb.from('customer_orders').select('id,order_number,total,payment_method,payment_reference,payer_phone,created_at,customers(full_name)').eq('payment_status', 'to_verify').order('created_at');
        if (!data?.length) { box.innerHTML = ''; return; }
        box.innerHTML = `<section class="card dv-verify"><div class="card-head"><h3><i class="fa-solid fa-mobile-screen"></i> Paiements Mobile Money à vérifier (${data.length})</h3><span class="muted">Vérifiez la référence dans vos SMS / votre compte marchand</span></div>${data.map(o => `<div class="m-row" data-id="${o.id}"><span class="m-txt"><b>${esc(o.order_number)} · ${money(o.total)}</b><small>${esc(o.customers?.full_name || '')} · ${esc(PAY[o.payment_method] || '')} · réf. <b>${esc(o.payment_reference || '')}</b>${o.payer_phone ? ' · depuis le ' + esc(o.payer_phone) : ''}</small></span><button type="button" class="btn primary sm" data-ok="1">Reçu</button><button type="button" class="btn light sm" data-ok="0">Introuvable</button></div>`).join('')}</section>`;
        box.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => { const id = b.closest('[data-id]').dataset.id; const ok = b.dataset.ok === '1'; if (!ok && !confirm('Paiement introuvable : le client paiera à la livraison. Continuer ?')) return; const { error } = await app.sb.rpc('verify_order_payment', { p_order: id, p_ok: ok }); if (error) return app.toast(X.explain(error), true); app.toast(ok ? 'Paiement confirmé.' : 'Paiement marqué introuvable.'); verifyPanel(); load(); });
      }
      async function load() {
        const box = host.querySelector('#dvList'); X.loading(box);
        const { data, error } = await app.sb.rpc('get_deliveries', { p_scope: scope });
        if (error) return X.errorPanel(box, error);
        const rows = data || []; const open = rows.filter(r => r.status !== 'delivered'); const done = rows.filter(r => r.status === 'delivered');
        host.querySelector('#dvKpis').innerHTML = X.kpis([['fa-motorcycle', 'En route', rows.filter(r => r.status === 'out_for_delivery').length, 'livraisons en cours', 'k-amber'], ['fa-box', 'À livrer', open.length, 'commandes', 'k-blue'], ['fa-circle-check', 'Livrées (24 h)', done.length, 'terminées', 'k-green'], ['fa-coins', 'Encaissé en livraison', money(done.reduce((n, r) => n + Number(r.cash_collected || 0), 0)), 'à remettre à la caisse', 'k-pink']]);
        const card = r => {
          const s = ST[r.status] || [r.status, 'info']; const p = PST[r.payment_status] || PST.unpaid; const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([r.address, r.zone, 'Brazzaville'].filter(Boolean).join(', '));
          const wa = X.waNumber(r.whatsapp || r.phone);
          return `<article class="dv-card ${r.status}" data-id="${r.id}"><header><b>${esc(r.order_number)}</b><span class="tag ${s[1]}">${s[0]}</span>${r.requested ? `<small class="muted">pour le ${new Date(r.requested).toLocaleDateString('fr-FR')}</small>` : ''}</header>
            <div class="dv-who"><i class="fa-solid fa-user"></i> <b>${esc(r.customer || 'Client')}</b>${r.phone ? ` · ${esc(r.phone)}` : ''}</div>
            <div class="dv-addr"><i class="fa-solid fa-location-dot"></i> ${esc(r.address || 'Adresse à préciser')}${r.zone ? ` · <b>${esc(r.zone)}</b>` : ''}</div>
            <div class="dv-items"><i class="fa-solid fa-basket-shopping"></i> ${esc(r.items || '')}</div>
            <div class="dv-money"><span>Total ${money(r.total)}</span><span class="tm-state ${p[1]}">${esc(PAY[r.payment_method] || 'À la livraison')} · ${p[0]}</span>${r.status !== 'delivered' ? `<b class="dv-collect">${Number(r.to_collect) ? 'À encaisser : ' + money(r.to_collect) : 'Rien à encaisser'}</b>` : `<b>Encaissé : ${money(r.cash_collected || 0)}</b>`}</div>
            ${r.delivery_note ? `<p class="muted small"><i class="fa-solid fa-note-sticky"></i> ${esc(r.delivery_note)}</p>` : ''}
            ${canAssign() && r.status !== 'delivered' ? `<label class="dv-driver">Livreur <select data-driver><option value="">— Non attribuée —</option>${drivers.map(d => `<option value="${d.id}" ${d.id === r.driver_id ? 'selected' : ''}>${esc(d.full_name)}${d.role === 'driver' ? ' (livreur)' : ''}</option>`).join('')}</select></label>` : (r.driver ? `<small class="muted">Livreur : ${esc(r.driver)}</small>` : '')}
            <div class="dv-actions">${r.phone ? `<a class="btn light sm" href="tel:${esc(tel(r.phone))}"><i class="fa-solid fa-phone"></i> Appeler</a>` : ''}${wa ? `<a class="btn light sm" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour ${r.customer || ''}, c’est Les saveurs de Myra : votre commande ${r.order_number} est en route 🛵`)}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ''}<a class="btn light sm" target="_blank" rel="noopener" href="${maps}"><i class="fa-solid fa-route"></i> Itinéraire</a>
              ${r.status === 'delivered' ? (r.proof ? '<button type="button" class="btn light sm" data-proof><i class="fa-solid fa-image"></i> Preuve</button>' : '') : `${r.status !== 'out_for_delivery' ? '<button type="button" class="btn light sm" data-start><i class="fa-solid fa-motorcycle"></i> Je pars</button>' : ''}<button type="button" class="btn light sm" data-fail><i class="fa-solid fa-triangle-exclamation"></i> Échec</button><button type="button" class="btn primary sm" data-done><i class="fa-solid fa-check"></i> Livrée</button>`}</div></article>`;
        };
        box.innerHTML = (open.length ? `<div class="dv-grid">${open.map(card).join('')}</div>` : `<div class="empty"><span class="empty-ico"><i class="fa-solid fa-motorcycle"></i></span><b>${scope === 'mine' ? 'Aucune livraison ne vous est attribuée' : 'Aucune livraison en attente'}</b><p>Les commandes confirmées apparaissent ici.</p></div>`)
          + (done.length ? `<h4 class="ac-day">Livrées ces dernières 24 h</h4><div class="dv-grid">${done.map(card).join('')}</div>` : '');
        box.querySelectorAll('.dv-card').forEach(el => {
          const r = rows.find(x => x.id === el.dataset.id);
          const act = async (action, extra = {}) => { const { error: e } = await app.sb.rpc('update_delivery', { p_order: r.id, p_action: action, p_cash: extra.cash ?? null, p_proof: extra.proof ?? null, p_note: extra.note ?? null }); if (e) { app.toast(X.explain(e), true); return false; } load(); return true; };
          el.querySelector('[data-driver]')?.addEventListener('change', async e => { const { error: er } = await app.sb.rpc('assign_driver', { p_order: r.id, p_driver: e.target.value || null }); if (er) return app.toast(X.explain(er), true); app.toast(e.target.value ? 'Livreur attribué : il est prévenu.' : 'Livraison désattribuée.'); load(); });
          el.querySelector('[data-start]')?.addEventListener('click', async () => { if (await act('start')) app.toast('Bonne route ! Le statut est « En route ».'); });
          el.querySelector('[data-fail]')?.addEventListener('click', async () => { const note = prompt('Que s’est-il passé ? (client absent, adresse introuvable…)', 'Client absent'); if (note === null) return; if (await act('failed', { note })) app.toast('Livraison remise « Prête ». La direction est prévenue.'); });
          el.querySelector('[data-proof]')?.addEventListener('click', async () => { const { data: u, error: e } = await app.sb.storage.from('myra-deliveries').createSignedUrl(r.proof, 300); if (e) return app.toast(X.explain(e), true); X.modal('Preuve de livraison · ' + r.order_number, `<img src="${esc(u.signedUrl)}" alt="Photo de livraison" class="dv-photo">${r.delivery_note ? `<p>${esc(r.delivery_note)}</p>` : ''}`); });
          el.querySelector('[data-done]')?.addEventListener('click', () => {
            const m = X.modal('Livraison ' + r.order_number, `<label class="field">Montant encaissé (FCFA)<input name="cash" type="number" min="0" step="5" inputmode="numeric" value="${Number(r.to_collect) || 0}"></label>
              <label class="field">Photo (colis remis, reçu signé…) — facultatif<input name="photo" type="file" accept="image/*" capture="environment"></label>
              <label class="field">Remarque<input name="note" maxlength="300" placeholder="Ex. : remis au gardien"></label>`, '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit"><i class="fa-solid fa-check"></i> Confirmer la livraison</button>', { form: true, sub: Number(r.to_collect) ? 'À encaisser : ' + money(r.to_collect) : 'Commande déjà payée' });
            m.el.onsubmit = async e => {
              e.preventDefault(); const b = m.el.querySelector('[type=submit]'); b.disabled = true; let proof = null;
              const file = m.el.elements.photo.files?.[0];
              if (file) { try { proof = await uploadProof(app, file); } catch (err) { b.disabled = false; return app.toast('Photo non envoyée : ' + X.explain(err), true); } }
              if (await act('delivered', { cash: Number(m.el.elements.cash.value || 0), proof, note: m.el.elements.note.value })) { m.close(); app.toast('Commande livrée ✔'); } else b.disabled = false;
            };
          });
        });
      }
      verifyPanel(); load();
    }
  };

  /* ---------- Zones de livraison ---------- */
  EXT.pages.delivery_zones = {
    title: 'Zones de livraison',
    async render(host, app) {
      const edit = ['owner', 'admin', 'manager'].includes(app.state.profile?.role);
      host.innerHTML = X.head('Zones de livraison', 'Frais et délais par quartier de Brazzaville. Le client choisit son quartier dans la boutique : les frais s’ajoutent automatiquement.', edit ? '<button type="button" class="btn primary" id="dzAdd"><i class="fa-solid fa-plus"></i> Ajouter un quartier</button>' : '')
        + '<section class="card"><div id="dzList"></div></section><section class="card" id="dzFree"></section>';
      const box = host.querySelector('#dzList');
      async function load() {
        X.loading(box);
        const [{ data, error }, { data: shop }] = await Promise.all([app.sb.from('delivery_zones').select('*').order('sort_order').order('name'), app.sb.from('shop_settings').select('free_delivery_from').limit(1).maybeSingle()]);
        if (error) return X.errorPanel(box, error);
        box.innerHTML = `<div class="table-wrap"><table class="cards-m"><thead><tr><th>Quartier</th><th>Frais</th><th>Délai</th><th>Actif</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${(data || []).map(z => `<tr data-id="${z.id}"><td data-label="Quartier"><b>${esc(z.name)}</b></td><td data-label="Frais">${Number(z.fee) ? money(z.fee) : 'Offerte'}</td><td data-label="Délai">${esc(z.delay || '—')}</td><td data-label="Actif">${edit ? `<input type="checkbox" class="switch" data-on ${z.is_active ? 'checked' : ''} aria-label="Zone active">` : (z.is_active ? 'Oui' : 'Non')}</td>${edit ? '<td><button type="button" class="btn light sm" data-ed aria-label="Modifier"><i class="fa-solid fa-pen"></i></button> <button type="button" class="btn light sm" data-del aria-label="Supprimer"><i class="fa-solid fa-trash"></i></button></td>' : ''}</tr>`).join('')}</tbody></table></div>`;
        host.querySelector('#dzFree').innerHTML = `<div class="card-head"><h3><i class="fa-solid fa-gift"></i> Livraison offerte</h3></div><form id="dzFreeForm" class="ext-inline"><label class="field">Offerte dès (FCFA d’achats, vide = jamais)<input name="free" type="number" min="0" step="500" value="${shop?.free_delivery_from ?? ''}" ${edit ? '' : 'disabled'}></label>${edit ? '<button class="btn light" type="submit">Enregistrer</button>' : ''}</form>`;
        host.querySelector('#dzFreeForm').onsubmit = async e => { e.preventDefault(); const v = e.target.elements.free.value; const { error: er } = await app.sb.from('shop_settings').update({ free_delivery_from: v === '' ? null : Number(v), updated_at: new Date().toISOString() }).eq('id', true); if (er) return app.toast(X.explain(er), true); app.toast('Livraison offerte enregistrée.'); };
        box.querySelectorAll('tr[data-id]').forEach(tr => {
          const z = data.find(x => x.id === tr.dataset.id);
          tr.querySelector('[data-on]')?.addEventListener('change', async e => { const { error: er } = await app.sb.from('delivery_zones').update({ is_active: e.target.checked }).eq('id', z.id); if (er) app.toast(X.explain(er), true); });
          tr.querySelector('[data-ed]')?.addEventListener('click', () => form(z));
          tr.querySelector('[data-del]')?.addEventListener('click', async () => { if (!confirm(`Supprimer la zone « ${z.name} » ?`)) return; const { error: er } = await app.sb.from('delivery_zones').delete().eq('id', z.id); if (er) return app.toast(X.explain(er), true); load(); });
        });
      }
      function form(z = {}) {
        const m = X.modal(z.id ? 'Modifier ' + z.name : 'Nouveau quartier', `<div class="form-grid"><label class="field full-span">Quartier<input name="name" required maxlength="80" value="${esc(z.name || '')}"></label><label class="field">Frais (FCFA)<input name="fee" type="number" min="0" step="100" required value="${z.fee ?? 1000}"></label><label class="field">Délai<input name="delay" maxlength="40" value="${esc(z.delay || 'Le jour même')}"></label><label class="field">Ordre d’affichage<input name="sort_order" type="number" value="${z.sort_order ?? 50}"></label></div>`, '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button>', { form: true });
        m.el.onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(m.el)); const row = { name: f.name.trim(), fee: Number(f.fee), delay: f.delay.trim() || null, sort_order: Number(f.sort_order || 0) };
          const { error } = z.id ? await app.sb.from('delivery_zones').update(row).eq('id', z.id) : await app.sb.from('delivery_zones').insert(row); if (error) return app.toast(X.explain(error), true); m.close(); app.toast('Zone enregistrée.'); load(); };
      }
      host.querySelector('#dzAdd')?.addEventListener('click', () => form());
      load();
    }
  };

  /* ---------- Fiche commande : paiement Mobile Money et livreur ---------- */
  X.on('orderDetail', (o, body, close) => {
    if (!body) return; const app = A(); const role = app.state.profile?.role;
    const p = PST[o.payment_status] || PST.unpaid;
    const box = document.createElement('div'); box.className = 'od-pay';
    box.innerHTML = `<div class="kv-grid"><div class="kv"><span>Paiement</span><b>${esc(PAY[o.payment_method] || 'À la livraison')} · <span class="tm-state ${p[1]}">${p[0]}</span></b></div>${o.payment_reference ? `<div class="kv"><span>Référence</span><b>${esc(o.payment_reference)}${o.payer_phone ? ' · ' + esc(o.payer_phone) : ''}</b></div>` : ''}${o.delivery_driver ? `<div class="kv"><span>Livreur</span><b>${esc(o.delivery_driver)}</b></div>` : ''}</div>`
      + (o.payment_status === 'to_verify' && ['owner', 'admin', 'manager', 'accountant', 'sales'].includes(role) ? '<div class="actions"><button type="button" class="btn primary sm" data-pay="1"><i class="fa-solid fa-check"></i> Paiement reçu</button><button type="button" class="btn light sm" data-pay="0">Introuvable</button></div>' : '')
      + (['owner', 'admin', 'manager', 'sales'].includes(role) && !['delivered', 'cancelled', 'converted'].includes(o.status) ? '<div class="actions"><button type="button" class="btn light sm" data-go-dlv><i class="fa-solid fa-motorcycle"></i> Attribuer un livreur</button></div>' : '');
    body.prepend(box);
    box.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => { const { error } = await app.sb.rpc('verify_order_payment', { p_order: o.id, p_ok: b.dataset.pay === '1' }); if (error) return app.toast(X.explain(error), true); app.toast('Paiement mis à jour.'); close(); app.navigate('commandes'); });
    box.querySelector('[data-go-dlv]')?.addEventListener('click', () => { close(); app.navigate('deliveries'); });
  });
})();
