/* LSM Business Manager V39 — Coffrets et abonnements, paniers abandonnés, rentabilité par produit */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num } = X;
  X.menu('CATALOGUE & STOCK', [['bundles', 'Coffrets', 'fa-gift'], ['costing', 'Rentabilité', 'fa-scale-balanced']]);
  X.menu('RELATION CLIENT', [['carts', 'Paniers abandonnés', 'fa-cart-arrow-down']], 2);
  const canStock = () => ['owner', 'admin', 'manager', 'stock_manager'].includes(A()?.state?.profile?.role);

  /* ---------- Coffrets ---------- */
  EXT.pages.bundles = {
    title: 'Coffrets',
    async render(host, app) {
      host.innerHTML = X.head('Coffrets et abonnements', 'Composez des coffrets (ex. marinade + épices), assemblez-les à partir du stock, et validez les demandes d’abonnement reçues sur la boutique.', canStock() ? '<button type="button" class="btn primary" id="bdNew"><i class="fa-solid fa-plus"></i> Nouveau coffret</button>' : '')
        + '<div id="bdList"></div><section class="card"><div class="card-head"><h3><i class="fa-solid fa-repeat"></i> Demandes d’abonnement (boutique)</h3><button type="button" class="btn light sm" id="bdRec">Toutes les commandes récurrentes</button></div><div id="bdSubs"></div></section>';
      host.querySelector('#bdRec').onclick = () => app.navigate('recurring');
      const box = host.querySelector('#bdList'); let products = [];
      async function load() {
        X.loading(box);
        const [{ data: prods, error }, { data: items }] = await Promise.all([app.sb.from('products').select('id,name,unit,sale_price,stock_quantity,is_bundle,is_active,image_url').order('name'), app.sb.from('product_bundle_items').select('*')]);
        if (error) return X.errorPanel(box, error);
        products = prods || []; const bundles = products.filter(p => p.is_bundle);
        const comp = b => (items || []).filter(i => i.bundle_id === b.id).map(i => ({ ...i, p: products.find(p => p.id === i.component_id) })).filter(i => i.p);
        box.innerHTML = bundles.length ? `<div class="bd-grid">${bundles.map(b => { const c = comp(b); const value = c.reduce((n, i) => n + Number(i.p.sale_price) * Number(i.quantity), 0); const can = c.length ? Math.floor(Math.min(...c.map(i => Number(i.p.stock_quantity) / Number(i.quantity)))) : 0;
          return `<article class="card bd-card" data-id="${b.id}"><div class="card-head"><h3><i class="fa-solid fa-gift"></i> ${esc(b.name)}</h3><b>${money(b.sale_price)}</b></div>
            ${value > b.sale_price ? `<p class="bd-save">Valeur ${money(value)} · le client économise <b>${money(value - b.sale_price)}</b></p>` : value ? `<p class="muted small">Valeur des produits : ${money(value)}</p>` : ''}
            <ul class="bd-items">${c.map(i => `<li>${num(i.quantity)} × ${esc(i.p.name)} <small class="muted">(stock ${num(i.p.stock_quantity)})</small></li>`).join('') || '<li class="muted">Composition à définir</li>'}</ul>
            <div class="cc-line"><span>Coffrets prêts</span><b>${num(b.stock_quantity)}</b></div><div class="cc-line"><span>Encore assemblables</span><b>${can}</b></div>
            ${canStock() ? `<div class="actions"><button type="button" class="btn light sm" data-edit><i class="fa-solid fa-pen"></i> Composition</button><button type="button" class="btn primary sm" data-make ${can ? '' : 'disabled'}><i class="fa-solid fa-boxes-packing"></i> Assembler</button></div>` : ''}</article>`; }).join('')}</div>`
          : `<div class="empty"><span class="empty-ico"><i class="fa-solid fa-gift"></i></span><b>Aucun coffret pour le moment</b><p>Créez un coffret : il apparaîtra en tête de la boutique en ligne avec sa composition.</p></div>`;
        box.querySelectorAll('.bd-card').forEach(el => { const b = bundles.find(x => x.id === el.dataset.id);
          el.querySelector('[data-edit]')?.addEventListener('click', () => editor(b, comp(b)));
          el.querySelector('[data-make]')?.addEventListener('click', async () => { const q = prompt(`Combien de coffrets « ${b.name} » assembler ? Le stock des produits sera déduit.`, '1'); if (!q) return;
            const { data: r, error: e } = await app.sb.rpc('assemble_bundle', { p_bundle: b.id, p_qty: Number(q) }); if (e) return app.toast(X.explain(e), true); app.toast(`${q} coffret(s) assemblé(s). Stock coffret : ${num(r.stock)}.`); load(); });
        });
      }
      function editor(b, comp = []) {
        const opts = products.filter(p => !p.is_bundle && p.is_active && (!b || p.id !== b.id));
        const line = (i = {}) => `<div class="bd-line"><select name="component">${opts.map(p => `<option value="${p.id}" ${p.id === i.component_id ? 'selected' : ''}>${esc(p.name)} · ${money(p.sale_price)}</option>`).join('')}</select><input name="qty" type="number" min="0.001" step="any" value="${i.quantity ?? 1}" aria-label="Quantité"><button type="button" class="btn light sm" data-rm aria-label="Retirer"><i class="fa-solid fa-xmark"></i></button></div>`;
        const m = X.modal(b ? 'Composition · ' + b.name : 'Nouveau coffret', `${b ? '' : `<div class="form-grid"><label class="field full-span">Nom du coffret<input name="name" required maxlength="120" placeholder="Ex. : Coffret découverte"></label><label class="field">Prix du coffret (FCFA)<input name="price" type="number" min="1" step="50" required></label><label class="field">Unité<input name="unit" value="coffret"></label><label class="field full-span">Description<input name="description" maxlength="300" placeholder="Idéal pour offrir…"></label></div>`}
          <h4 class="pm-sub">Contenu</h4><div id="bdLines">${(comp.length ? comp : [{}]).map(line).join('')}</div><button type="button" class="btn light sm" id="bdAddLine"><i class="fa-solid fa-plus"></i> Ajouter un produit</button><p class="muted small" id="bdVal"></p>`,
          '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button>', { form: true, wide: true });
        const val = () => { let v = 0; m.el.querySelectorAll('.bd-line').forEach(l => { const p = products.find(x => x.id === l.querySelector('select').value); v += Number(p?.sale_price || 0) * Number(l.querySelector('input').value || 0); }); m.el.querySelector('#bdVal').textContent = 'Valeur des produits séparés : ' + money(v); };
        const wire = () => m.el.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { x.closest('.bd-line').remove(); val(); });
        m.el.querySelector('#bdAddLine').onclick = () => { m.el.querySelector('#bdLines').insertAdjacentHTML('beforeend', line()); wire(); val(); };
        m.el.addEventListener('input', val); m.el.addEventListener('change', val); wire(); val();
        m.el.onsubmit = async e => {
          e.preventDefault(); const lines = [...m.el.querySelectorAll('.bd-line')].map(l => ({ component_id: l.querySelector('select').value, quantity: Number(l.querySelector('input').value) })).filter(l => l.component_id && l.quantity > 0);
          if (!lines.length) return app.toast('Ajoutez au moins un produit au coffret.', true);
          if (new Set(lines.map(l => l.component_id)).size !== lines.length) return app.toast('Un même produit apparaît deux fois : regroupez les quantités.', true);
          let id = b?.id;
          if (!id) { const f = m.el.elements; const { data: p, error } = await app.sb.from('products').insert({ name: f.name.value.trim(), sale_price: Number(f.price.value), unit: f.unit.value || 'coffret', description: f.description.value || null, is_bundle: true, is_active: true, stock_quantity: 0 }).select('id').single(); if (error) return app.toast(X.explain(error), true); id = p.id; }
          const { error: d } = await app.sb.from('product_bundle_items').delete().eq('bundle_id', id); if (d) return app.toast(X.explain(d), true);
          const { error: i } = await app.sb.from('product_bundle_items').insert(lines.map(l => ({ ...l, bundle_id: id }))); if (i) return app.toast(X.explain(i), true);
          m.close(); app.toast('Coffret enregistré. Assemblez-le pour le mettre en stock.'); load();
        };
      }
      async function subs() {
        const el = host.querySelector('#bdSubs');
        const { data, error } = await app.sb.from('recurring_orders').select('*,customers(full_name,phone)').like('label', 'Abonnement boutique%').order('created_at', { ascending: false }).limit(50);
        if (error) return X.errorPanel(el, error);
        const F = { weekly: 'Chaque semaine', biweekly: 'Toutes les 2 semaines', monthly: 'Chaque mois' };
        el.innerHTML = (data || []).length ? data.map(r => `<div class="m-row" data-id="${r.id}"><span class="m-txt"><b>${esc(r.customers?.full_name || r.label)}</b><small>${esc(F[r.frequency] || r.frequency)} · prochaine le ${new Date(r.next_date + 'T12:00:00').toLocaleDateString('fr-FR')} · ${(r.items || []).length} produit(s)${r.delivery_zone ? ' · ' + esc(r.delivery_zone) : ''}</small></span>${r.is_active ? '<span class="tm-state on">Actif</span>' : '<span class="tm-state off">À valider</span>'}<button type="button" class="btn ${r.is_active ? 'light' : 'primary'} sm" data-tg>${r.is_active ? 'Suspendre' : 'Valider'}</button></div>`).join('') : '<p class="muted">Aucune demande d’abonnement pour le moment. Les clients peuvent s’abonner au moment de commander sur la boutique.</p>';
        el.querySelectorAll('[data-tg]').forEach(b => b.onclick = async () => { const r = data.find(x => x.id === b.closest('[data-id]').dataset.id); const { error: e } = await app.sb.from('recurring_orders').update({ is_active: !r.is_active }).eq('id', r.id); if (e) return app.toast(X.explain(e), true); app.toast(r.is_active ? 'Abonnement suspendu.' : 'Abonnement validé : les commandes seront créées automatiquement.'); subs(); });
      }
      host.querySelector('#bdNew')?.addEventListener('click', () => editor(null));
      load(); subs();
    }
  };

  /* ---------- Paniers abandonnés ---------- */
  EXT.pages.carts = {
    title: 'Paniers abandonnés',
    async render(host, app) {
      host.innerHTML = X.head('Paniers abandonnés', 'Clients qui ont rempli leur panier et saisi leur téléphone sur la boutique, sans finaliser la commande. Relancez-les sur WhatsApp.') + '<div id="caKpis"></div><section class="card"><div id="caList"></div></section>';
      const box = host.querySelector('#caList');
      async function load() {
        X.loading(box);
        const { data, error } = await app.sb.from('shop_carts').select('*').order('updated_at', { ascending: false }).limit(300);
        if (error) return X.errorPanel(box, error);
        const old = Date.now() - 3600e3; const open = (data || []).filter(c => c.status === 'open' && new Date(c.updated_at).getTime() < old);
        const conv = (data || []).filter(c => c.status === 'converted');
        host.querySelector('#caKpis').innerHTML = X.kpis([['fa-cart-arrow-down', 'À relancer', open.length, 'paniers de plus d’1 h', 'k-amber'], ['fa-sack-dollar', 'Montant en attente', money(open.reduce((n, c) => n + Number(c.total), 0)), 'si tous commandent', 'k-pink'], ['fa-circle-check', 'Récupérés', conv.filter(c => c.reminded_count > 0).length, 'après une relance', 'k-green'], ['fa-percent', 'Taux de finalisation', (data || []).length ? Math.round(conv.length / data.length * 100) + ' %' : '—', 'des paniers commencés', 'k-blue']]);
        box.innerHTML = open.length ? open.map(c => { const wa = X.waNumber(c.phone); const items = (c.items || []).map(i => `${num(i.quantity)} × ${i.name}`).join(', ');
          const msg = `Bonjour${c.customer_name ? ' ' + c.customer_name.split(' ')[0] : ''} 👋, c’est Les saveurs de Myra. Votre panier vous attend : ${items} (${money(c.total)}). Souhaitez-vous que nous finalisions la commande pour vous ? ${location.origin}/boutique.html`;
          return `<div class="m-row" data-id="${c.id}"><span class="m-txt"><b>${esc(c.customer_name || 'Client')} · ${esc(c.phone)}</b><small>${esc(items)} · <b>${money(c.total)}</b></small><small class="muted">Panier du ${new Date(c.updated_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${c.reminded_count ? ` · relancé ${c.reminded_count} fois` : ''}</small></span>
            ${wa ? `<a class="btn primary sm" target="_blank" rel="noopener" data-remind href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}"><i class="fa-brands fa-whatsapp"></i> Relancer</a>` : ''}<button type="button" class="btn light sm" data-dismiss aria-label="Classer">Classer</button></div>`; }).join('')
          : '<div class="empty"><span class="empty-ico"><i class="fa-solid fa-cart-shopping"></i></span><b>Aucun panier à relancer</b><p>Un panier apparaît ici une heure après avoir été abandonné.</p></div>';
        box.querySelectorAll('[data-id]').forEach(el => {
          el.querySelector('[data-remind]')?.addEventListener('click', () => app.sb.rpc('mark_cart_reminded', { p_id: el.dataset.id, p_dismiss: false }).then(() => setTimeout(load, 800)));
          el.querySelector('[data-dismiss]')?.addEventListener('click', async () => { const { error: e } = await app.sb.rpc('mark_cart_reminded', { p_id: el.dataset.id, p_dismiss: true }); if (e) return app.toast(X.explain(e), true); load(); });
        });
      }
      load();
    }
  };

  /* ---------- Rentabilité ---------- */
  EXT.pages.costing = {
    title: 'Rentabilité',
    async render(host, app) {
      host.innerHTML = X.head('Rentabilité par produit', 'Coût réel de chaque produit (matières de la recette, emballage, main-d’œuvre), marge et prix conseillé.', '<button type="button" class="btn light" id="coCsv"><i class="fa-solid fa-file-csv"></i> CSV</button>') + '<div id="coKpis"></div><section class="card"><div id="coList"></div></section>';
      const box = host.querySelector('#coList'); let rows = [];
      const calc = p => { const base = p.is_bundle ? Number(p.bundle_cost || 0) : (p.material_cost != null ? Number(p.material_cost) : Number(p.cost_price || 0));
        const unit = base + (p.is_bundle ? 0 : Number(p.packaging_cost || 0) + Number(p.labour_cost || 0)); const price = Number(p.sale_price || 0); const margin = price - unit; const pct = price ? margin / price * 100 : 0;
        const t = Math.min(95, Number(p.target_margin_pct || 40)); const advice = unit ? Math.ceil(unit / (1 - t / 100) / 50) * 50 : null;
        return { base, unit, price, margin, pct, advice, src: p.is_bundle ? 'Coffret' : p.material_cost != null ? 'Recette' : 'Prix d’achat', profit30: margin * Number(p.sold_30d || 0) }; };
      async function load() {
        X.loading(box);
        const { data, error } = await app.sb.rpc('get_product_costing'); if (error) return X.errorPanel(box, error);
        rows = (data || []).map(p => ({ ...p, c: calc(p) }));
        const sold = rows.filter(r => r.sold_30d > 0); const rev = sold.reduce((n, r) => n + Number(r.revenue_30d), 0); const prof = sold.reduce((n, r) => n + r.c.profit30, 0);
        host.querySelector('#coKpis').innerHTML = X.kpis([['fa-sack-dollar', 'Chiffre d’affaires 30 j', money(rev), 'produits vendus', 'k-blue'], ['fa-chart-line', 'Marge brute 30 j', money(prof), rev ? Math.round(prof / rev * 100) + ' % du CA' : '—', 'k-green'], ['fa-triangle-exclamation', 'Sous la marge visée', rows.filter(r => r.c.unit && r.c.pct < Number(r.target_margin_pct)).length, 'produits à revoir', 'k-amber'], ['fa-circle-question', 'Coût inconnu', rows.filter(r => !r.c.unit).length, 'recette ou prix d’achat manquant', 'k-pink']]);
        box.innerHTML = `<div class="table-wrap"><table class="cards-m"><thead><tr><th>Produit</th><th>Coût matières</th><th>Emballage</th><th>Main-d’œuvre</th><th>Coût de revient</th><th>Prix de vente</th><th>Marge</th><th>Prix conseillé</th><th>Vendus 30 j</th></tr></thead><tbody>${rows.map(r => `<tr data-id="${r.id}"><td data-label="Produit"><b>${esc(r.name)}</b><br><small class="muted">${esc(r.c.src)}${r.missing_costs ? ` · ${r.missing_costs} matière(s) sans coût` : ''}</small></td>
          <td data-label="Coût matières">${r.c.base ? money(r.c.base) : '<span class="txt-warn">—</span>'}</td>
          <td data-label="Emballage">${r.is_bundle ? '—' : `<input type="number" min="0" step="5" class="co-in" data-k="packaging_cost" value="${Number(r.packaging_cost)}" aria-label="Emballage">`}</td>
          <td data-label="Main-d’œuvre">${r.is_bundle ? '—' : `<input type="number" min="0" step="5" class="co-in" data-k="labour_cost" value="${Number(r.labour_cost)}" aria-label="Main-d’œuvre">`}</td>
          <td data-label="Coût de revient"><b>${r.c.unit ? money(r.c.unit) : '—'}</b></td><td data-label="Prix de vente">${money(r.c.price)}</td>
          <td data-label="Marge"><b class="${!r.c.unit ? '' : r.c.pct < 0 ? 'txt-bad' : r.c.pct < Number(r.target_margin_pct) ? 'txt-warn' : 'txt-ok'}">${r.c.unit ? money(r.c.margin) + ' · ' + Math.round(r.c.pct) + ' %' : '—'}</b></td>
          <td data-label="Prix conseillé">${r.c.advice ? money(r.c.advice) : '—'}<br><small class="muted">pour <input type="number" min="0" max="95" step="1" class="co-in sm" data-k="target_margin_pct" value="${Number(r.target_margin_pct)}" aria-label="Marge visée"> %</small></td>
          <td data-label="Vendus 30 j">${num(r.sold_30d)}${r.sold_30d ? `<br><small class="muted">marge ${money(r.c.profit30)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>
          <p class="muted small">Coût matières = recette active (quantités × coût moyen des matières premières ÷ rendement). Sans recette : prix d’achat du produit. Modifiez l’emballage, la main-d’œuvre ou la marge visée : c’est enregistré aussitôt.</p>`;
        box.querySelectorAll('.co-in').forEach(i => i.onchange = async () => { const id = i.closest('tr').dataset.id; const { error: e } = await app.sb.from('products').update({ [i.dataset.k]: Number(i.value || 0), updated_at: new Date().toISOString() }).eq('id', id); if (e) return app.toast(X.explain(e), true); app.toast('Enregistré.'); load(); });
      }
      host.querySelector('#coCsv').onclick = () => app.exportCsv('rentabilite', rows.map(r => ({ produit: r.name, cout_matieres: r.c.base, emballage: r.packaging_cost, main_oeuvre: r.labour_cost, cout_revient: r.c.unit, prix_vente: r.c.price, marge: r.c.margin, marge_pct: Math.round(r.c.pct), prix_conseille: r.c.advice, vendus_30j: r.sold_30d })));
      load();
    }
  };
})();
