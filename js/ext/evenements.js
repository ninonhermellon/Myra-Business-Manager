/* Myra V29 — 7. Traiteur & événements · 8. Bons cadeaux */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num, fdate, today, iso } = X;

  Object.assign(EXT.labels, { wedding: 'Mariage', birthday: 'Anniversaire', corporate: 'Entreprise / séminaire', funeral: 'Veillée / retrait de deuil', religious: 'Cérémonie religieuse' });
  Object.assign(EXT.statusLabels, { quote: 'Devis', done: 'Réalisé', active: 'Actif', used: 'Utilisé' });
  EXT.moneyKeys.push('price_per_guest', 'extra_fees', 'total_amount', 'deposit_amount', 'deposit_paid', 'initial_amount', 'balance');

  /* ---------- 7. Traiteur ---------- */
  EXT.config.catering_events = {
    title: 'Événements traiteur', desc: 'Mariages, anniversaires, séminaires : devis, acompte et calendrier.', table: 'catering_events',
    search: ['title', 'location', 'status', 'menu'],
    fields: [['title', 'Nom de l’événement', 'text', true], ['customer_id', 'Client', 'relation-customer'], ['event_type', 'Type', 'select', ['wedding', 'birthday', 'corporate', 'funeral', 'religious', 'other']], ['event_date', 'Date et heure', 'datetime-local', true], ['location', 'Lieu', 'text'], ['guests', 'Nombre de personnes', 'number', true], ['price_per_guest', 'Prix par personne (FCFA)', 'number', true], ['extra_fees', 'Frais supplémentaires (FCFA)', 'number'], ['deposit_amount', 'Acompte demandé (FCFA)', 'number'], ['deposit_paid', 'Acompte reçu (FCFA)', 'number'], ['status', 'Statut', 'select', ['quote', 'confirmed', 'done', 'cancelled']], ['menu', 'Menu proposé', 'textarea'], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.catering_events = { cols: ['event_date', 'title', 'customer_id', 'guests', 'status', 'total_amount'], title: 'title', amount: 'total_amount' };
  X.menu('TRAITEUR & CADEAUX', [['catering', 'Événements traiteur', 'fa-champagne-glasses'], ['gift_cards', 'Bons cadeaux', 'fa-gift']], 2);

  EXT.pages.catering = {
    title: 'Événements traiteur',
    async render(host, app) {
      X.loading(host);
      let events, customers;
      try { [events, customers] = await Promise.all([X.load('catering_events', '*', 'event_date', true), X.load('customers', 'id,full_name,phone', 'full_name', true)]); } catch (e) { return X.errorPanel(host, e); }
      app.state.cache.catering_events = events; app.state.names = app.state.names || {}; customers.forEach(c => { app.state.names[c.id] = c.full_name; });
      const live = events.filter(e => e.status !== 'cancelled');
      const upcoming = live.filter(e => e.event_date >= new Date().toISOString() && e.status !== 'done');
      const depositDue = upcoming.reduce((n, e) => n + Math.max(0, Number(e.deposit_amount) - Number(e.deposit_paid)), 0);
      let cursor = new Date(); cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const draw = () => {
        const y = cursor.getFullYear(), mth = cursor.getMonth(), first = (new Date(y, mth, 1).getDay() + 6) % 7, days = new Date(y, mth + 1, 0).getDate();
        const byDay = {}; live.forEach(e => { const d = new Date(e.event_date); if (d.getFullYear() === y && d.getMonth() === mth) (byDay[d.getDate()] = byDay[d.getDate()] || []).push(e); });
        const cells = []; for (let i = 0; i < first; i++) cells.push('<div class="cal-cell empty"></div>');
        for (let d = 1; d <= days; d++) { const isToday = iso(new Date(y, mth, d)) === today(); cells.push(`<div class="cal-cell ${isToday ? 'today' : ''}"><span>${d}</span>${(byDay[d] || []).map(e => `<button type="button" class="cal-ev s-${esc(e.status)}" data-id="${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}</button>`).join('')}</div>`); }
        host.querySelector('#calGrid').innerHTML = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => `<div class="cal-dow">${d}</div>`).join('') + cells.join('');
        host.querySelector('#calTitle').textContent = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        host.querySelectorAll('.cal-ev').forEach(b => b.onclick = () => app.openRecordDetail('catering_events', b.dataset.id, events));
      };
      host.innerHTML = X.head('Événements traiteur', 'Devis, acomptes et calendrier des prestations.', `<button class="btn primary" type="button" id="evAdd"><i class="fa-solid fa-plus"></i> Nouvel événement</button>`)
        + X.kpis([['fa-calendar-check', 'À venir', String(upcoming.length), upcoming[0] ? `Prochain : ${fdate(upcoming[0].event_date)}` : 'Aucun événement prévu', 'k-green'], ['fa-file-signature', 'Devis en attente', String(live.filter(e => e.status === 'quote').length), 'à faire confirmer', 'k-blue'], ['fa-hand-holding-dollar', 'Acomptes à recevoir', money(depositDue), 'sur les événements à venir', 'k-amber'], ['fa-sack-dollar', 'Chiffre prévu', money(upcoming.reduce((n, e) => n + Number(e.total_amount), 0)), 'événements à venir', 'k-pink']])
        + `<section class="card ext-cal"><div class="card-head"><button type="button" class="round-btn" id="calPrev" aria-label="Mois précédent"><i class="fa-solid fa-chevron-left"></i></button><h3 id="calTitle"></h3><button type="button" class="round-btn" id="calNext" aria-label="Mois suivant"><i class="fa-solid fa-chevron-right"></i></button></div><div class="cal-grid" id="calGrid"></div></section>`
        + X.table(['Date', 'Événement', 'Personnes', 'Total', 'Acompte', 'Statut'], upcoming.map(e => `<tr data-id="${esc(e.id)}" class="ext-click"><td data-role="meta">${new Date(e.event_date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td><td data-role="title">${esc(e.title)}</td><td data-role="meta">${num(e.guests)} pers.</td><td data-role="amount">${money(e.total_amount)}</td><td data-role="meta">${money(e.deposit_paid)} / ${money(e.deposit_amount)}</td><td data-role="meta">${app.status(e.status)}</td></tr>`), 'Aucun événement à venir.');
      draw();
      host.querySelector('#calPrev').onclick = () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); draw(); };
      host.querySelector('#calNext').onclick = () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); draw(); };
      host.querySelector('#evAdd').onclick = () => app.openForm('catering_events', { status: 'quote', event_type: 'wedding', guests: 100, price_per_guest: 5000, extra_fees: 0, deposit_amount: 0, deposit_paid: 0 });
      host.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => app.openRecordDetail('catering_events', tr.dataset.id, events)));
    }
  };
  async function printQuote(e) {
    const app = A(); let cust = null;
    if (e.customer_id) { const r = await app.sb.from('customers').select('full_name,phone,address').eq('id', e.customer_id).maybeSingle(); cust = r.data; }
    const rest = Math.max(0, Number(e.total_amount) - Number(e.deposit_paid)), quote = e.status === 'quote';
    const when = new Date(e.event_date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
    X.printDoc({ title: 'Devis traiteur', kicker: quote ? 'Devis traiteur' : 'Confirmation traiteur', subtitle: e.title,
      itemsTitle: 'Prestation',
      items: [{ name: 'Prestation traiteur par personne', meta: EXT.labels[e.event_type] || 'Traiteur', qty: e.guests, price: e.price_per_guest, total: e.guests * e.price_per_guest },
        ...(Number(e.extra_fees) ? [{ name: 'Frais supplémentaires', meta: 'Service, transport, matériel', qty: 1, price: e.extra_fees, total: e.extra_fees }] : [])],
      parties: [{ label: 'Client', main: cust?.full_name || '—', lines: [cust?.phone, cust?.address] }, { label: 'Événement', main: EXT.labels[e.event_type] || e.title, lines: [when, e.location] }],
      blocks: [['Émis le', fdate(new Date())], ['Validité', '15 jours'], ['Invités', String(e.guests)]],
      sections: e.menu ? [{ title: 'Menu', text: e.menu }] : [],
      totals: [['Acompte demandé', money(e.deposit_amount)], ['Acompte reçu', money(e.deposit_paid)]],
      grand: ['Total', money(e.total_amount)], rest: rest > 0 ? ['Reste à payer', money(rest), 'due'] : ['Prestation soldée', '✓', 'ok'],
      pill: (quote ? 'Total du devis · ' : 'Reste à payer · ') + money(quote ? e.total_amount : rest),
      status: quote ? ['Date réservée à réception de l’acompte', 'warn'] : ['Réservation confirmée — merci !', 'ok'],
      notice: ['Conditions', 'Devis valable 15 jours. La réservation de la date est confirmée à réception de l’acompte.'],
      signatures: ['Bon pour accord — date et signature du client'] });
  }

  /* ---------- 8. Bons cadeaux ---------- */
  EXT.config.gift_cards = {
    title: 'Bons cadeaux', desc: 'Bons à offrir, utilisables en caisse avec leur code.', table: 'gift_cards',
    search: ['code', 'buyer_name', 'status'],
    fields: [['code', 'Code', 'text', true], ['initial_amount', 'Montant initial (FCFA)', 'number', true], ['balance', 'Solde restant (FCFA)', 'number', true], ['customer_id', 'Bénéficiaire (client)', 'relation-customer'], ['buyer_name', 'Offert par', 'text'], ['expires_at', 'Valable jusqu’au', 'date'], ['status', 'Statut', 'select', ['active', 'used', 'expired', 'cancelled']], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.gift_cards = { cols: ['code', 'buyer_name', 'initial_amount', 'expires_at', 'status', 'balance'], title: 'code', amount: 'balance' };
  const newCode = () => 'MYRA-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('').replace(/(.{3})(.{3})/, '$1-$2');
  EXT.pages.gift_cards = {
    title: 'Bons cadeaux',
    async render(host, app) {
      await app.renderTable('gift_cards');
      const add = host.querySelector('#addBtn'); if (!add) return;
      const clone = add.cloneNode(true); add.replaceWith(clone); clone.innerHTML = '<i class="fa-solid fa-gift"></i> Nouveau bon';
      clone.onclick = () => {
        const m = X.modal('Nouveau bon cadeau', `<div class="form-grid"><label class="field">Montant (FCFA)<input name="amount" type="number" min="500" step="500" value="10000" required></label><label class="field">Valable jusqu’au<input name="expires" type="date" value="${X.iso(X.addDays(new Date(), 180))}"></label><label class="field">Offert par<input name="buyer" placeholder="Nom de l’acheteur"></label><label class="field">Code<input name="code" value="${newCode()}" required></label></div><p class="muted">Encaissez le montant du bon comme une vente habituelle (produit « Bon cadeau » ou note), puis remettez le bon imprimé.</p>`, `<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Créer et imprimer</button>`, { form: true });
        m.el.addEventListener('submit', async e => {
          e.preventDefault(); const f = m.el.elements, amount = Number(f.amount.value);
          const card = { code: f.code.value.trim().toUpperCase(), initial_amount: amount, balance: amount, buyer_name: f.buyer.value.trim() || null, expires_at: f.expires.value || null, status: 'active' };
          const { data, error } = await app.sb.from('gift_cards').insert(card).select('*').single(); if (error) return app.toast(X.explain(error), true);
          m.close(); app.toast('Bon cadeau créé.'); printCard(data); app.navigate('gift_cards', { silent: true });
        });
      };
    }
  };
  async function printCard(g) {
    X.printDoc({ title: 'Bon cadeau ' + g.code, kicker: 'Bon cadeau', subtitle: g.buyer_name ? 'Offert par ' + g.buyer_name : 'Un moment de saveurs à partager',
      sections: [{ html: `<div style="text-align:center;padding:6px 0 2px"><div style="font-size:34px;font-weight:700;letter-spacing:-.02em">${money(g.initial_amount)}</div><div style="width:150px;margin:14px auto 6px">${X.qrSvg(g.code, 4)}</div><div style="font:600 16px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em">${esc(g.code)}</div></div>` },
        { title: 'Récapitulatif', soft: true, rows: [['Valeur', money(g.initial_amount)], ['Code', g.code], ['Valable jusqu’au', g.expires_at ? fdate(g.expires_at) : 'Sans limite'], ['Offert par', g.buyer_name || '']] }],
      pill: 'Valeur · ' + money(g.initial_amount), status: ['Présentez ce bon lors de votre achat', 'ok'] });
  }

  async function useCard(g) {
    const app = A();
    const m = X.modal('Utiliser le bon ' + g.code, `<p>Solde disponible : <b>${money(g.balance)}</b></p><div class="form-grid"><label class="field">Montant utilisé (FCFA)<input name="amount" type="number" min="1" max="${Number(g.balance)}" value="${Number(g.balance)}" required></label><label class="field">Note<input name="note" placeholder="Ex. vente du 12/03"></label></div><p class="muted">Pour une vente, utilisez plutôt le champ « Bon cadeau » du formulaire de vente : la remise et le débit du bon sont alors faits ensemble.</p>`, `<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Débiter le bon</button>`, { form: true });
    m.el.addEventListener('submit', async e => { e.preventDefault(); const { data, error } = await app.sb.rpc('redeem_gift_card', { p_code: g.code, p_amount: Number(m.el.elements.amount.value), p_note: m.el.elements.note.value || null }); if (error) return app.toast(error.message, true); m.close(); app.toast(`Bon débité. Nouveau solde : ${money(data)}.`); app.navigate('gift_cards', { silent: true }); });
  }

  /* Bon cadeau dans le formulaire de vente */
  X.on('saleForm', ctx => {
    if (!X.isReady()) return;
    const app = A(); let card = null;
    const wrap = document.createElement('label'); wrap.className = 'field'; wrap.innerHTML = `Bon cadeau<span class="ext-inline"><input name="gift_code" placeholder="MYRA-XXX-XXX" autocomplete="off"><button type="button" class="btn light sm" id="gcApply">Appliquer</button></span><small class="muted" id="gcMsg"></small>`;
    ctx.form.elements.promotion_code.closest('label').after(wrap);
    const msg = wrap.querySelector('#gcMsg');
    const reset = () => { card = null; ctx.extraDiscount = 0; ctx.extraLabel = ''; ctx.giftCard = null; ctx.recalc(); };
    const apply = async () => {
      const code = wrap.querySelector('input').value.trim().toUpperCase(); if (!code) { msg.textContent = ''; return reset(); }
      const { data } = await app.sb.from('gift_cards').select('id,code,balance,status,expires_at').eq('code', code).maybeSingle();
      if (!data) { msg.textContent = 'Bon cadeau introuvable.'; return reset(); }
      if (data.status !== 'active' || (data.expires_at && data.expires_at < today()) || Number(data.balance) <= 0) { msg.textContent = 'Ce bon n’est plus utilisable (épuisé, expiré ou annulé).'; return reset(); }
      card = data; recompute(); ctx.recalc();
    };
    const recompute = () => {
      if (!card) return; let sub = 0; ctx.rows.querySelectorAll('.sale-item-row').forEach(r => sub += Number(r.querySelector('.item-qty').value || 0) * Number(r.querySelector('.item-price').value || 0));
      const other = Number(ctx.form.elements.discount.value || 0) + Number(String(document.getElementById('promoDiscount')?.textContent || '0').replace(/\D/g, '') || 0);
      ctx.extraDiscount = Math.max(0, Math.min(Number(card.balance), sub - other)); ctx.extraLabel = `Bon cadeau ${card.code}`; ctx.giftCard = card;
      msg.textContent = `Solde ${money(card.balance)} — ${money(ctx.extraDiscount)} utilisés sur cette vente.`;
    };
    wrap.querySelector('#gcApply').onclick = apply; wrap.querySelector('input').addEventListener('change', apply);
    ctx.onRecalc = () => { if (card) { const before = ctx.extraDiscount; recompute(); if (before !== ctx.extraDiscount) ctx.recalc(); } };
  });
  X.on('saleRecalc', c => { if (typeof c.onRecalc === 'function') c.onRecalc(); });
  X.on('saleDraftCreated', async (ctx, sale) => {
    if (!ctx.giftCard || !ctx.extraDiscount) return;
    const { error } = await A().sb.rpc('redeem_gift_card', { p_code: ctx.giftCard.code, p_amount: ctx.extraDiscount, p_sale_id: sale.sale_id, p_note: 'Vente ' + sale.sale_number });
    if (error) throw new Error('Bon cadeau refusé : ' + error.message + '. La vente n’a pas été enregistrée.');
  });

  /* Actions dans les fiches */
  X.on('detailActions', (page, r) => {
    if (page === 'catering_events') return `<button type="button" class="icon-action" title="Imprimer le devis" data-ext="ev-quote"><i class="fa-solid fa-file-signature"></i></button>`;
    if (page === 'gift_cards') return `<button type="button" class="icon-action" title="Imprimer le bon" data-ext="gc-print"><i class="fa-solid fa-print"></i></button>${r.status === 'active' ? `<button type="button" class="icon-action" title="Utiliser le bon" data-ext="gc-use"><i class="fa-solid fa-hand-holding-dollar"></i></button>` : ''}`;
    return '';
  });
  X.on('detailAction', (action, page, r) => { if (action === 'ev-quote') printQuote(r); if (action === 'gc-print') printCard(r); if (action === 'gc-use') useCard(r); });
})();
