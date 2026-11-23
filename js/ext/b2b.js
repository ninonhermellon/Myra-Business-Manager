/* Myra V29 — 4. Tarifs par client / quantité · 5. Commandes récurrentes · 6. Crédit client */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num, fdate, today, daysBetween } = X;

  Object.assign(EXT.labels, { retail: 'Détail', wholesale: 'Gros (professionnel)', weekly: 'Chaque semaine', biweekly: 'Toutes les 2 semaines', monthly: 'Chaque mois' });
  EXT.moneyKeys.push('price', 'credit_limit', 'wholesale_price');

  /* ---------- Nouveaux champs dans les fiches client et produit (après migration) ---------- */
  X.whenReady(app => {
    X.addField(app, 'customers', ['price_tier', 'Type de client', 'select', ['retail', 'wholesale']], 'Identité');
    X.addField(app, 'customers', ['credit_limit', 'Plafond de crédit (FCFA)', 'number']);
    X.addField(app, 'customers', ['payment_terms_days', 'Délai de paiement (jours)', 'number']);
    X.addField(app, 'customers', ['birth_date', 'Date d’anniversaire', 'date'], 'Identité');
    X.addField(app, 'products', ['wholesale_price', 'Prix de gros (FCFA)', 'number'], 'Prix');
    X.addField(app, 'products', ['barcode', 'Code-barres', 'text'], 'Nom & référence');
  });

  /* ---------- 4. Tarifs ---------- */
  EXT.config.customer_prices = {
    title: 'Prix négociés par client', desc: 'Un prix spécial pour un client et un produit (hôtel, restaurant, supermarché…).', table: 'customer_prices',
    search: ['notes'], fields: [['customer_id', 'Client', 'relation-customer', true], ['product_id', 'Produit', 'relation-product', true], ['price', 'Prix négocié (FCFA)', 'number', true], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.customer_prices = { cols: ['customer_id', 'product_id', 'price'], title: 'customer_id', amount: 'price' };
  EXT.config.volume_prices = {
    title: 'Prix par quantité', desc: 'Prix dégressif à partir d’une quantité achetée (ex. 3 800 FCFA dès 10 pots).', table: 'volume_prices',
    search: [], fields: [['product_id', 'Produit', 'relation-product', true], ['min_quantity', 'À partir de (quantité)', 'number', true], ['price', 'Prix unitaire (FCFA)', 'number', true]]
  };
  EXT.listViews.volume_prices = { cols: ['product_id', 'min_quantity', 'price'], title: 'product_id', amount: 'price' };
  X.menu('CLIENTS PROFESSIONNELS', [['customer_prices', 'Prix négociés', 'fa-handshake'], ['volume_prices', 'Prix par quantité', 'fa-layer-group'], ['recurring', 'Commandes récurrentes', 'fa-repeat'], ['credit', 'Crédit clients', 'fa-credit-card'], ['payment_schedules', 'Échéancier', 'fa-calendar-days']], 1);

  /* Même règle que la fonction SQL resolve_price : prix négocié > meilleur prix (gros, quantité, public). */
  function resolvePrice(p, customer, qty, cprices, vprices) {
    const neg = cprices.find(x => x.product_id === p.id); if (neg) return { price: Number(neg.price), why: 'Prix négocié' };
    let best = Number(p.sale_price), why = '';
    const tier = vprices.filter(v => v.product_id === p.id && Number(v.min_quantity) <= qty).sort((a, b) => b.min_quantity - a.min_quantity)[0];
    if (tier && Number(tier.price) < best) { best = Number(tier.price); why = `Prix dès ${num(tier.min_quantity)}`; }
    if (customer?.price_tier === 'wholesale' && p.wholesale_price != null && Number(p.wholesale_price) < best) { best = Number(p.wholesale_price); why = 'Prix de gros'; }
    return { price: best, why };
  }

  /* Formulaire de vente : prix automatiques + contrôle du plafond de crédit */
  X.on('saleForm', ctx => {
    if (!X.isReady()) return;
    const app = A(); let cprices = [], vprices = [], pinfo = new Map(), cinfo = null, credit = null;
    const hint = document.createElement('small'); hint.className = 'muted ext-hint'; ctx.rows.after(hint);
    Promise.all([X.load('volume_prices', 'product_id,min_quantity,price', 'min_quantity', true), app.fetchAll(() => app.sb.from('products').select('id,sale_price,wholesale_price').eq('is_active', true))])
      .then(([v, p]) => { vprices = v; (p.data || []).forEach(x => pinfo.set(x.id, x)); }).catch(() => {});
    const apply = () => {
      const notes = [];
      ctx.rows.querySelectorAll('.sale-item-row').forEach(r => {
        const pid = r.querySelector('.item-product').value, price = r.querySelector('.item-price');
        if (!pid || r.dataset.manual === '1' || !pinfo.has(pid)) return;
        const { price: v, why } = resolvePrice(pinfo.get(pid), cinfo, Number(r.querySelector('.item-qty').value) || 1, cprices, vprices);
        price.value = v; r.dataset.why = why; if (why) notes.push(why);
      });
      hint.textContent = notes.length ? `Tarif appliqué : ${[...new Set(notes)].join(', ')}.` : '';
      ctx.recalc();
    };
    const loadCustomer = async () => {
      const id = ctx.form.elements.customer_id.value; cprices = []; cinfo = null; credit = null;
      if (id) {
        const [c, cp, cr] = await Promise.all([app.sb.from('customers').select('id,price_tier,credit_limit').eq('id', id).maybeSingle(), app.sb.from('customer_prices').select('product_id,price').eq('customer_id', id), app.sb.from('customer_credit').select('outstanding,credit_limit').eq('customer_id', id).maybeSingle()]);
        cinfo = c.data; cprices = cp.data || []; credit = cr.data;
      }
      ctx.credit = credit; apply(); showCredit();
    };
    const showCredit = () => {
      let box = ctx.form.querySelector('#creditInfo'); if (!box) { box = document.createElement('div'); box.id = 'creditInfo'; box.className = 'ext-credit full-span'; ctx.form.querySelector('.form-grid').append(box); }
      const isCredit = ctx.form.elements.sale_type.value === 'credit';
      if (!isCredit || !credit) { box.innerHTML = ''; return; }
      const lim = credit.credit_limit == null ? null : Number(credit.credit_limit), out = Number(credit.outstanding || 0);
      box.innerHTML = `<i class="fa-solid fa-credit-card"></i> Encours actuel : <b>${money(out)}</b>${lim != null ? ` · plafond <b>${money(lim)}</b> · disponible <b>${money(Math.max(0, lim - out))}</b>` : ' · aucun plafond défini'}`;
    };
    ctx.rows.addEventListener('change', e => { if (e.target.classList.contains('item-product')) { e.target.closest('.sale-item-row').dataset.manual = ''; apply(); } });
    ctx.rows.addEventListener('input', e => { if (e.target.classList.contains('item-price') && e.isTrusted) e.target.closest('.sale-item-row').dataset.manual = '1'; if (e.target.classList.contains('item-qty')) apply(); });
    ctx.form.elements.customer_id.addEventListener('change', loadCustomer);
    ctx.form.elements.sale_type.addEventListener('change', showCredit);
  });
  X.on('saleBeforeSubmit', async (ctx, sale) => {
    if (!X.isReady() || sale.sale_type !== 'credit') return;
    if (!sale.customer_id) throw new Error('Choisissez un client pour une vente à crédit.');
    const { data } = await A().sb.from('customer_credit').select('outstanding,credit_limit,full_name').eq('customer_id', sale.customer_id).maybeSingle();
    if (data && data.credit_limit != null && Number(data.outstanding) + sale.total > Number(data.credit_limit))
      throw new Error(`Plafond de crédit dépassé pour ${data.full_name} : encours ${money(data.outstanding)} + vente ${money(sale.total)} > plafond ${money(data.credit_limit)}. Encaissez d’abord ou augmentez le plafond.`);
  });

  /* ---------- 5. Commandes récurrentes ---------- */
  EXT.pages.recurring = {
    title: 'Commandes récurrentes',
    async render(host, app) {
      X.loading(host);
      let subs, customers, products;
      try { [subs, customers, products] = await Promise.all([X.load('recurring_orders', '*', 'next_date', true), X.load('customers', 'id,full_name,phone,address', 'full_name', true), X.load('products', 'id,name,unit,sale_price,is_active', 'name', true)]); } catch (e) { return X.errorPanel(host, e); }
      const cmap = new Map(customers.map(c => [c.id, c])), pmap = new Map(products.map(p => [p.id, p]));
      const due = subs.filter(s => s.is_active && s.next_date <= today());
      host.innerHTML = X.head('Commandes récurrentes', 'Les commandes qui se répètent (ex. 20 pots chaque lundi) sont créées automatiquement dans « Commandes ».', `<button class="btn light" type="button" id="recGen"><i class="fa-solid fa-bolt"></i> Créer les commandes dues (${due.length})</button><button class="btn primary" type="button" id="recAdd"><i class="fa-solid fa-plus"></i> Nouvel abonnement</button>`)
        + X.kpis([['fa-repeat', 'Abonnements actifs', String(subs.filter(s => s.is_active).length), `${subs.length} au total`, 'k-green'], ['fa-bell', 'À créer aujourd’hui', String(due.length), due.length ? 'Cliquez sur « Créer les commandes dues »' : 'Rien en attente', 'k-amber']])
        + X.table(['Client', 'Rythme', 'Prochaine', 'Articles', 'Actif'], subs.map(s => `<tr data-id="${esc(s.id)}" class="ext-click"><td data-role="title">${esc(cmap.get(s.customer_id)?.full_name || 'Client')}${s.label ? ` <small class="muted">· ${esc(s.label)}</small>` : ''}</td><td data-role="meta">${esc(EXT.labels[s.frequency])}</td><td data-role="meta">${fdate(s.next_date)}${s.next_date <= today() && s.is_active ? ' <span class="tone warn">à créer</span>' : ''}</td><td data-role="meta">${(s.items || []).map(i => `${num(i.quantity)} × ${esc(pmap.get(i.product_id)?.name || '?')}`).join(', ')}</td><td data-role="meta">${s.is_active ? '<span class="tone ok">Actif</span>' : '<span class="tone neutral">En pause</span>'}</td></tr>`), 'Aucun abonnement. Exemple : le Méridien reçoit 20 pots chaque lundi.');
      host.querySelector('#recAdd').onclick = () => editSub(null, customers, products);
      host.querySelector('#recGen').onclick = async () => { const { data, error } = await app.sb.rpc('generate_due_recurring_orders'); if (error) return app.toast(X.explain(error), true); app.toast(data ? `${data} commande${data > 1 ? 's' : ''} créée${data > 1 ? 's' : ''} dans « Commandes ».` : 'Aucune commande à créer aujourd’hui.'); app.navigate('recurring', { silent: true }); };
      host.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => editSub(subs.find(s => s.id === tr.dataset.id), customers, products)));
    }
  };
  function editSub(sub, customers, products) {
    const app = A(), s = sub || { frequency: 'weekly', next_date: today(), items: [], is_active: true, delivery_fee: 0 };
    const line = (it = {}) => `<div class="sale-line rec-line"><select class="rl-p" required><option value="">Produit</option>${products.filter(p => p.is_active !== false).map(p => `<option value="${esc(p.id)}" ${p.id === it.product_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><input class="rl-q" type="number" min="0.001" step="0.001" value="${esc(it.quantity || 1)}" aria-label="Quantité"><button type="button" class="icon-action rl-x" title="Retirer"><i class="fa-solid fa-trash"></i></button></div>`;
    const m = X.modal(sub ? 'Modifier l’abonnement' : 'Nouvel abonnement', `<div class="form-grid"><label class="field">Client<select name="customer_id" required><option value="">Choisir</option>${customers.map(c => `<option value="${esc(c.id)}" ${c.id === s.customer_id ? 'selected' : ''}>${esc(c.full_name)}</option>`).join('')}</select></label><label class="field">Nom (facultatif)<input name="label" value="${esc(s.label || '')}" placeholder="Livraison du lundi"></label><label class="field">Rythme<select name="frequency">${['weekly', 'biweekly', 'monthly'].map(f => `<option value="${f}" ${f === s.frequency ? 'selected' : ''}>${EXT.labels[f]}</option>`).join('')}</select></label><label class="field">Prochaine livraison<input name="next_date" type="date" value="${esc(s.next_date)}" required></label><label class="field">Zone<input name="delivery_zone" value="${esc(s.delivery_zone || '')}"></label><label class="field">Frais de livraison (FCFA)<input name="delivery_fee" type="number" min="0" value="${esc(s.delivery_fee || 0)}"></label><label class="field full-span">Adresse<input name="delivery_address" value="${esc(s.delivery_address || '')}"></label><label class="field is-check"><span class="fl">Actif</span><input type="checkbox" name="is_active" ${s.is_active ? 'checked' : ''}></label></div><div class="line-items"><div class="line-items-head"><b>Articles livrés à chaque fois</b><button type="button" class="btn light" id="rlAdd"><i class="fa-solid fa-plus"></i> Ajouter</button></div><div id="rlRows">${(s.items.length ? s.items : [{}]).map(line).join('')}</div><small class="muted">Le prix est calculé à chaque commande (prix négocié du client, prix de gros ou prix public).</small></div>`,
      `${sub ? '<button type="button" class="btn danger-outline" id="rlDel"><i class="fa-solid fa-trash"></i> Supprimer</button>' : ''}<button type="button" class="btn light" data-close>Annuler</button><button type="submit" class="btn primary">Enregistrer</button>`, { form: true });
    const rows = m.el.querySelector('#rlRows');
    m.el.querySelector('#rlAdd').onclick = () => rows.insertAdjacentHTML('beforeend', line());
    rows.addEventListener('click', e => { if (e.target.closest('.rl-x') && rows.children.length > 1) e.target.closest('.rec-line').remove(); });
    m.el.querySelector('#rlDel')?.addEventListener('click', async () => { if (!confirm('Supprimer cet abonnement ? Les commandes déjà créées sont conservées.')) return; const { error } = await app.sb.from('recurring_orders').delete().eq('id', sub.id); if (error) return app.toast(X.explain(error), true); m.close(); app.toast('Abonnement supprimé.'); app.navigate('recurring', { silent: true }); });
    m.el.addEventListener('submit', async e => {
      e.preventDefault(); const f = m.el.elements;
      const items = [...rows.querySelectorAll('.rec-line')].map(r => ({ product_id: r.querySelector('.rl-p').value, quantity: Number(r.querySelector('.rl-q').value) })).filter(i => i.product_id && i.quantity > 0);
      if (!items.length) return app.toast('Ajoutez au moins un article.', true);
      const payload = { customer_id: f.customer_id.value, label: f.label.value.trim() || null, frequency: f.frequency.value, next_date: f.next_date.value, delivery_zone: f.delivery_zone.value.trim() || null, delivery_address: f.delivery_address.value.trim() || null, delivery_fee: Number(f.delivery_fee.value) || 0, is_active: f.is_active.checked, items };
      const q = sub ? app.sb.from('recurring_orders').update(payload).eq('id', sub.id) : app.sb.from('recurring_orders').insert(payload);
      const { error } = await q; if (error) return app.toast(X.explain(error), true);
      m.close(); app.toast('Abonnement enregistré.'); app.navigate('recurring', { silent: true });
    });
  }
  /* Création automatique, une fois par jour et par appareil, à l'ouverture du tableau de bord */
  X.on('dashboard', async () => {
    if (!X.isReady() || !navigator.onLine) return;
    const key = 'myra_recurring_run'; try { if (localStorage.getItem(key) === today()) return; localStorage.setItem(key, today()); } catch (_) {}
    const role = A().state.profile?.role; if (!['owner', 'admin', 'manager', 'sales'].includes(role)) return;
    const { data, error } = await A().sb.rpc('generate_due_recurring_orders');
    if (!error && data) A().toast(`${data} commande${data > 1 ? 's' : ''} récurrente${data > 1 ? 's' : ''} créée${data > 1 ? 's' : ''} automatiquement.`);
  });

  /* ---------- 6. Crédit clients ---------- */
  EXT.config.payment_schedules = {
    title: 'Échéancier', desc: 'Paiements en plusieurs fois : dates et montants prévus.', table: 'payment_schedules',
    search: ['notes'], fields: [['sale_id', 'Vente', 'relation-sale', true], ['due_date', 'Date prévue', 'date', true], ['amount', 'Montant (FCFA)', 'number', true], ['is_paid', 'Payé', 'checkbox'], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.payment_schedules = { cols: ['due_date', 'sale_id', 'amount', 'is_paid'], title: 'sale_id', amount: 'amount' };
  EXT.pages.credit = {
    title: 'Crédit clients',
    async render(host, app) {
      X.loading(host);
      let rows;
      { const { data, error } = await app.sb.from('customer_credit').select('*').or('outstanding.gt.0,credit_limit.not.is.null').order('outstanding', { ascending: false }).limit(2000); if (error) return X.errorPanel(host, error); rows = data || []; }
      const list = rows.filter(r => Number(r.outstanding) > 0 || r.credit_limit != null).sort((a, b) => b.outstanding - a.outstanding);
      const total = list.reduce((n, r) => n + Number(r.outstanding), 0);
      const over = list.filter(r => r.credit_limit != null && Number(r.outstanding) > Number(r.credit_limit));
      const late = list.filter(r => r.oldest_unpaid_at && r.payment_terms_days != null && daysBetween(r.oldest_unpaid_at, today()) > r.payment_terms_days);
      host.innerHTML = X.head('Crédit clients', 'Encours de chaque client, plafond autorisé et retards. Le plafond se règle dans la fiche client.', `<button class="btn light" type="button" id="crSched"><i class="fa-solid fa-calendar-days"></i> Échéancier</button>`)
        + X.kpis([['fa-sack-dollar', 'Total à encaisser', money(total), `${list.filter(r => r.outstanding > 0).length} client(s)`, 'k-amber'], ['fa-ban', 'Plafond dépassé', String(over.length), 'Nouvelles ventes à crédit bloquées', 'k-pink'], ['fa-clock', 'En retard', String(late.length), 'Délai de paiement dépassé', 'k-blue']])
        + X.table(['Client', 'Encours', 'Plafond', 'Utilisation', 'Plus ancienne', 'Relance'], list.map(r => {
          const lim = r.credit_limit == null ? null : Number(r.credit_limit), pct = lim ? Math.min(100, Math.round(r.outstanding / lim * 100)) : null; const age = r.oldest_unpaid_at ? daysBetween(r.oldest_unpaid_at, today()) : null;
          const wa = X.waNumber(r.phone); const msg = `Bonjour ${r.full_name}, sauf erreur de notre part, il reste ${money(r.outstanding)} à régler sur vos achats chez Les Saveurs de Myra. Merci de votre confiance !`;
          return `<tr><td data-role="title">${esc(r.full_name)}</td><td data-role="amount">${money(r.outstanding)}</td><td data-role="meta">${lim == null ? 'Aucun' : money(lim)}</td><td data-role="meta">${pct == null ? '—' : `<span class="ext-bar ${pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : ''}"><i style="width:${pct}%"></i></span> ${pct} %`}</td><td data-role="meta">${age == null ? '—' : `${age} j${r.payment_terms_days != null && age > r.payment_terms_days ? ' <span class="tone bad">en retard</span>' : ''}`}</td><td data-role="meta">${wa && r.outstanding > 0 ? `<a class="btn light sm" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}"><i class="fa-brands fa-whatsapp"></i> Relancer</a>` : '—'}</td></tr>`;
        }), 'Aucun encours client. Tout est encaissé.');
      host.querySelector('#crSched').onclick = () => app.navigate('payment_schedules');
    }
  };
})();
