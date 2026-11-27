/* Myra V29 — 1. Lots & dates limites · 2. Étiquettes QR · 3. Retours & réclamations */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num, fdate, today, daysBetween } = X;

  /* ---------- Tables gérées par les écrans génériques ---------- */
  Object.assign(EXT.relations, {
    'relation-lot': ['product_lots', 'id,lot_number', 'lot_number'],
    'relation-sale': ['sales', 'id,sale_number', 'sale_number']
  });
  Object.assign(EXT.labels, {
    damaged: 'Produit abîmé', quality: 'Qualité / goût', delivery: 'Livraison', missing: 'Article manquant',
    none: 'Aucune', refund: 'Remboursement', voucher: 'Bon d’achat', replacement: 'Remplacement'
  });
  Object.assign(EXT.statusLabels, { open: 'Ouverte', resolved: 'Résolue' });
  EXT.moneyKeys.push('resolution_amount');

  EXT.config.product_lots = {
    title: 'Lots & dates limites', desc: 'Numéro de lot, date de fabrication et date limite de chaque production.', table: 'product_lots',
    search: ['lot_number', 'notes'],
    fields: [['product_id', 'Produit', 'relation-product', true], ['lot_number', 'Numéro de lot', 'text', true], ['production_date', 'Date de fabrication', 'date', true], ['expiry_date', 'Date limite (DLC)', 'date'], ['quantity_initial', 'Quantité produite', 'number'], ['quantity_remaining', 'Quantité restante', 'number'], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.product_lots = { cols: ['lot_number', 'product_id', 'production_date', 'expiry_date', 'quantity_remaining'], title: 'product_id' };

  EXT.config.complaints = {
    title: 'Retours & réclamations', desc: 'Produits abîmés, clients mécontents : suivi et solution apportée.', table: 'complaints',
    search: ['description', 'category', 'status'],
    fields: [['customer_id', 'Client', 'relation-customer'], ['sale_id', 'Vente concernée', 'relation-sale'], ['product_id', 'Produit', 'relation-product'], ['lot_id', 'Lot concerné', 'relation-lot'], ['category', 'Type de problème', 'select', ['damaged', 'quality', 'delivery', 'missing', 'other'], true], ['description', 'Description', 'textarea', true], ['resolution', 'Solution apportée', 'select', ['none', 'refund', 'voucher', 'replacement']], ['resolution_amount', 'Montant remboursé / bon (FCFA)', 'number'], ['status', 'Statut', 'select', ['open', 'resolved', 'rejected']]]
  };
  EXT.listViews.complaints = { cols: ['created_at', 'customer_id', 'category', 'product_id', 'status', 'resolution_amount'], title: 'customer_id', amount: 'resolution_amount' };
  X.menu('TRAÇABILITÉ', [['lots', 'Lots & dates limites', 'fa-calendar-xmark'], ['labels', 'Étiquettes', 'fa-qrcode'], ['complaints', 'Réclamations', 'fa-triangle-exclamation']], 3);

  const expiryState = l => {
    if (!l.expiry_date) return ['none', 'Sans date', 'neutral'];
    const d = daysBetween(today(), l.expiry_date);
    if (d < 0) return ['expired', `Expiré depuis ${-d} j`, 'bad'];
    if (d <= 7) return ['soon', d === 0 ? 'Expire aujourd’hui' : `Expire dans ${d} j`, 'warn'];
    if (d <= 30) return ['month', `Dans ${d} j`, 'info'];
    return ['ok', `Dans ${d} j`, 'ok'];
  };

  /* ---------- Page « Lots & dates limites » : vendre d'abord les plus anciens ---------- */
  EXT.pages.lots = {
    title: 'Lots & dates limites',
    async render(host, app) {
      X.loading(host, 'Chargement des lots…');
      let lots, products;
      try { [lots, products] = await Promise.all([X.load('product_lots', '*', 'expiry_date', true), X.load('products', 'id,name,unit,stock_quantity', 'name', true)]); } catch (e) { return X.errorPanel(host, e); }
      const pmap = new Map(products.map(p => [p.id, p]));
      const active = lots.filter(l => Number(l.quantity_remaining) > 0);
      const expired = active.filter(l => expiryState(l)[0] === 'expired'), soon = active.filter(l => expiryState(l)[0] === 'soon');
      const byProduct = new Map(); active.forEach(l => { if (!byProduct.has(l.product_id)) byProduct.set(l.product_id, l); });
      host.innerHTML = X.head('Lots & dates limites', 'Les lots sont classés du plus ancien au plus récent : vendez toujours le premier de la liste.', `<button class="btn light" type="button" id="lotLabels"><i class="fa-solid fa-qrcode"></i> Étiquettes</button><button class="btn primary" type="button" id="lotAdd"><i class="fa-solid fa-plus"></i> Nouveau lot</button>`)
        + X.kpis([['fa-boxes-stacked', 'Lots en stock', String(active.length), `${num(active.reduce((n, l) => n + Number(l.quantity_remaining), 0))} unités`, 'k-green'], ['fa-hourglass-half', 'À vendre en priorité', String(soon.length), 'Date limite dans 7 jours ou moins', 'k-amber'], ['fa-ban', 'Expirés', String(expired.length), expired.length ? 'À retirer de la vente' : 'Aucun lot expiré', 'k-pink'], ['fa-calendar-check', 'Produits suivis', String(byProduct.size), 'avec au moins un lot', 'k-blue']])
        + (byProduct.size ? `<section class="card ext-fefo"><div class="card-head"><h3>À vendre en premier</h3><span>un lot par produit</span></div><div class="fefo-list">${[...byProduct.values()].map(l => { const [, label, tone] = expiryState(l); const p = pmap.get(l.product_id); return `<button type="button" class="m-row" data-lot="${esc(l.id)}"><span class="m-ico i-${tone === 'bad' ? 'red' : tone === 'warn' ? 'amber' : 'green'}"><i class="fa-solid fa-jar"></i></span><span class="m-txt"><b>${esc(p?.name || 'Produit')}</b><small>Lot ${esc(l.lot_number)} · ${num(l.quantity_remaining)} restant(s)</small></span><span class="tone ${tone}">${esc(label)}</span></button>`; }).join('')}</div></section>` : '')
        + X.table(['Lot', 'Produit', 'Fabrication', 'Date limite', 'Restant', 'État'], lots.map(l => { const [, label, tone] = expiryState(l); return `<tr data-id="${esc(l.id)}" class="ext-click"><td data-role="title">${esc(l.lot_number)}</td><td data-role="meta">${esc(pmap.get(l.product_id)?.name || '—')}</td><td data-role="meta">${fdate(l.production_date)}</td><td data-role="meta">${fdate(l.expiry_date)}</td><td data-role="amount">${num(l.quantity_remaining)}</td><td data-role="meta">${Number(l.quantity_remaining) > 0 ? `<span class="tone ${tone}">${esc(label)}</span>` : '<span class="tone neutral">Épuisé</span>'}</td></tr>`; }), 'Aucun lot enregistré. Créez un lot à chaque production.');
      app.state.cache.product_lots = lots;
      app.state.names = app.state.names || {}; products.forEach(p => { app.state.names[p.id] = p.name; });
      host.querySelector('#lotAdd').onclick = () => app.openForm('product_lots', { lot_number: nextLotNumber(lots), production_date: today(), quantity_initial: '', quantity_remaining: '' });
      host.querySelector('#lotLabels').onclick = () => app.navigate('labels');
      host.querySelectorAll('[data-id],[data-lot]').forEach(el => el.addEventListener('click', () => app.openRecordDetail('product_lots', el.dataset.id || el.dataset.lot, lots)));
    }
  };
  function nextLotNumber(lots) {
    const base = 'LOT-' + today().replaceAll('-', ''); const n = lots.filter(l => String(l.lot_number).startsWith(base)).length + 1;
    return `${base}-${String(n).padStart(2, '0')}`;
  }

  /* ---------- 2. Étiquettes à imprimer (nom, prix, lot, date limite, QR) ---------- */
  EXT.pages.labels = {
    title: 'Étiquettes',
    async render(host, app) {
      X.loading(host);
      let products, lots = [], company = {};
      try { products = await X.load('products', 'id,name,unit,sale_price,sku,is_active', 'name', true); } catch (e) { return X.errorPanel(host, e); }
      try { lots = await X.load('product_lots', 'id,lot_number,product_id,expiry_date,production_date', 'production_date', false); } catch (_) { lots = []; }
      try { company = await app.getCompanyDocumentInfo(); } catch (_) {}
      host.innerHTML = X.head('Étiquettes', 'Imprimez des étiquettes avec prix, lot, date limite et QR code (format A4, 3 × 8 par page).')
        + `<form class="panel ext-form" id="lblForm"><div class="form-grid"><label class="field">Produit<select name="product" required>${products.filter(p => p.is_active !== false).map(p => `<option value="${esc(p.id)}">${esc(p.name)} — ${money(p.sale_price)}</option>`).join('')}</select></label><label class="field">Lot<select name="lot"><option value="">Sans lot</option></select></label><label class="field">Nombre d’étiquettes<input name="copies" type="number" min="1" max="240" value="24"></label><label class="field">Contenu du QR code<select name="qr"><option value="lot">Lot (traçabilité)</option><option value="product">Produit (scan en caisse)</option><option value="none">Pas de QR code</option></select></label></div><div class="actions" style="margin-top:14px"><button class="btn primary" type="submit"><i class="fa-solid fa-print"></i> Aperçu et impression</button></div></form><div class="panel"><h3>Aperçu</h3><div id="lblPreview" class="lbl-preview"></div></div>`;
      const f = host.querySelector('#lblForm');
      const fillLots = () => { const pid = f.elements.product.value; f.elements.lot.innerHTML = '<option value="">Sans lot</option>' + lots.filter(l => l.product_id === pid).map(l => `<option value="${esc(l.id)}">${esc(l.lot_number)} · DLC ${fdate(l.expiry_date)}</option>`).join(''); if (f.elements.lot.options.length > 1) f.elements.lot.selectedIndex = 1; preview(); };
      const labelHtml = () => {
        const p = products.find(x => x.id === f.elements.product.value); const l = lots.find(x => x.id === f.elements.lot.value);
        const qrText = f.elements.qr.value === 'lot' && l ? `MYRA:LOT:${l.lot_number}` : f.elements.qr.value === 'none' ? '' : `MYRA:PRODUIT:${p.id}`;
        return `<div class="lbl"><div class="lbl-txt"><small>${esc(company.name || 'Les saveurs de Myra')}</small><b>${esc(p.name)}</b><span>${esc(p.unit || '')}</span><strong>${money(p.sale_price)}</strong>${l ? `<em>Lot ${esc(l.lot_number)}</em><em>À consommer avant le ${fdate(l.expiry_date)}</em>` : ''}</div>${qrText ? `<div class="lbl-qr">${X.qrSvg(qrText, 2)}</div>` : ''}</div>`;
      };
      const preview = () => { host.querySelector('#lblPreview').innerHTML = products.length ? labelHtml() : '<p class="muted">Ajoutez d’abord des produits.</p>'; };
      f.elements.product.addEventListener('change', fillLots); f.elements.lot.addEventListener('change', preview); f.elements.qr.addEventListener('change', preview);
      f.addEventListener('submit', e => {
        e.preventDefault(); const n = Math.max(1, Math.min(240, Number(f.elements.copies.value) || 1)); const one = labelHtml();
        X.printHtml('Étiquettes', `<div class="sheet">${Array.from({ length: n }, () => one).join('')}</div>`, `body{margin:0}.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.lbl{height:37mm;padding:3mm 4mm;border:1px dashed #ccc;display:flex;gap:3mm;align-items:center;overflow:hidden}.lbl-txt{flex:1;display:flex;flex-direction:column;line-height:1.2;min-width:0}.lbl-txt small{font-size:7pt;color:#557}.lbl-txt b{font-size:10pt}.lbl-txt span{font-size:8pt;color:#555}.lbl-txt strong{font-size:12pt;margin:1mm 0}.lbl-txt em{font-style:normal;font-size:7pt}.lbl-qr svg{width:20mm;height:20mm}@page{size:A4;margin:8mm}`);
      });
      if (products.length) fillLots();
    }
  };

  /* ---------- Tableau de bord : alerte dates limites ---------- */
  X.on('dashboard', async slot => {
    if (!slot) return;
    try {
      const lots = await X.load('product_lots', 'id,lot_number,product_id,expiry_date,quantity_remaining', 'expiry_date', true);
      const urgent = lots.filter(l => Number(l.quantity_remaining) > 0 && l.expiry_date && daysBetween(today(), l.expiry_date) <= 7);
      if (!urgent.length) return;
      const el = document.createElement('button'); el.type = 'button'; el.className = 'ext-alert warn';
      el.innerHTML = `<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i><span><b>${urgent.length} lot${urgent.length > 1 ? 's' : ''} à écouler en priorité</b><small>Date limite dépassée ou dans 7 jours au plus</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>`;
      el.onclick = () => A().navigate('lots'); slot.append(el);
    } catch (_) { /* module non activé : rien à afficher */ }
  });

  /* ---------- Fiche d'un lot : imprimer ses étiquettes ---------- */
  X.on('detailActions', (page, r) => page === 'product_lots' ? `<button type="button" class="icon-action" title="Étiquettes de ce lot" data-ext="lot-labels"><i class="fa-solid fa-qrcode"></i></button>` : '');
  X.on('detailAction', (action) => { if (action === 'lot-labels') A().navigate('labels'); });
})();
