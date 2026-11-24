/* Myra V29 — 11. Stock par lieu (cuisine, boutique, marché…) et transferts */
(() => {
  const X = window.MyraX, { EXT, A, esc, num, fdate } = X;

  Object.assign(EXT.relations, { 'relation-location': ['stock_locations', 'id,name', 'name'] });
  Object.assign(EXT.labels, { kitchen: 'Cuisine / atelier', shop: 'Boutique', market: 'Stand au marché', depot: 'Dépôt' });

  EXT.config.stock_locations = {
    title: 'Lieux de stockage', desc: 'Cuisine, boutique, stand au marché, dépôt…', table: 'stock_locations', search: ['name'],
    fields: [['name', 'Nom du lieu', 'text', true], ['kind', 'Type', 'select', ['kitchen', 'shop', 'market', 'depot', 'other']], ['is_active', 'Actif', 'checkbox'], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.stock_locations = { cols: ['name', 'kind', 'is_active'], title: 'name' };
  EXT.config.stock_transfers = {
    title: 'Historique des transferts', desc: 'Mouvements entre lieux.', table: 'stock_transfers', readonly: true, search: ['notes'],
    fields: [['created_at', 'Date', 'date'], ['product_id', 'Produit', 'relation-product'], ['quantity', 'Quantité', 'number'], ['from_location_id', 'De', 'relation-location'], ['to_location_id', 'Vers', 'relation-location'], ['notes', 'Notes', 'text']]
  };
  EXT.listViews.stock_transfers = { cols: ['created_at', 'product_id', 'quantity', 'from_location_id', 'to_location_id'], title: 'product_id' };
  X.menu('CATALOGUE & STOCK', [['by_location', 'Stock par lieu', 'fa-warehouse'], ['inventory', 'Inventaire (scan)', 'fa-barcode'], ['stock_locations', 'Lieux', 'fa-location-dot'], ['stock_transfers', 'Transferts', 'fa-right-left']]);

  EXT.pages.by_location = {
    title: 'Stock par lieu',
    async render(host, app) {
      X.loading(host);
      let locs, stock, products;
      try { [locs, stock, products] = await Promise.all([X.load('stock_locations', '*', 'name', true), X.loadKeyed('location_stock', 'location_id,product_id,quantity', ['location_id', 'product_id']), X.load('products', 'id,name,unit,stock_quantity,is_active', 'name', true)]); } catch (e) { return X.errorPanel(host, e); }
      locs = locs.filter(l => l.is_active); products = products.filter(p => p.is_active !== false);
      const q = (l, p) => Number(stock.find(s => s.location_id === l && s.product_id === p)?.quantity || 0);
      const unassigned = p => Math.max(0, Number(p.stock_quantity) - locs.reduce((n, l) => n + q(l.id, p.id), 0));
      host.innerHTML = X.head('Stock par lieu', 'Répartition du stock total entre vos lieux. « Non affecté » = stock pas encore placé dans un lieu.', `<button class="btn light" type="button" id="locAddLoc"><i class="fa-solid fa-location-dot"></i> Nouveau lieu</button><button class="btn primary" type="button" id="locMove"><i class="fa-solid fa-right-left"></i> Transférer</button>`)
        + (locs.length ? '' : `<div class="panel"><p>Créez d’abord vos lieux (ex. « Cuisine », « Boutique Poto-Poto », « Stand marché Total »), puis placez le stock avec « Transférer ».</p></div>`)
        + `<div class="table-card ext-table ext-matrix"><div class="table-wrap"><table class="cards-m"><thead><tr><th>Produit</th><th class="r">Total</th>${locs.map(l => `<th class="r">${esc(l.name)}</th>`).join('')}<th class="r">Non affecté</th></tr></thead><tbody>${products.map(p => `<tr><td data-role="title">${esc(p.name)}</td><td data-role="amount" class="r">${num(p.stock_quantity)}</td>${locs.map(l => `<td data-role="meta" class="r" data-label="${esc(l.name)}">${num(q(l.id, p.id))}</td>`).join('')}<td data-role="meta" class="r" data-label="Non affecté">${num(unassigned(p))}</td></tr>`).join('')}</tbody></table></div></div>`
        + '<p class="muted">Les ventes déduisent le stock total. Pensez à transférer vers « Non affecté » ce qui a été vendu en boutique, ou faites un inventaire par lieu pour réaligner.</p>';
      host.querySelector('#locAddLoc').onclick = () => app.openForm('stock_locations', { is_active: true, kind: 'shop' });
      host.querySelector('#locMove').onclick = () => {
        const opt = (sel) => `<option value="">Non affecté</option>${locs.map(l => `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}`;
        const m = X.modal('Transférer du stock', `<div class="form-grid"><label class="field full-span">Produit<select name="product" required>${products.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (total ${num(p.stock_quantity)})</option>`).join('')}</select></label><label class="field">De<select name="from">${opt('')}</select></label><label class="field">Vers<select name="to">${opt(locs[0]?.id)}</select></label><label class="field">Quantité<input name="qty" type="number" min="0.001" step="0.001" required></label><label class="field">Note<input name="notes" placeholder="Ex. réassort du samedi"></label></div><small class="muted" id="trAvail"></small>`, `<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Transférer</button>`, { form: true });
        const f = m.el.elements; const avail = () => { const p = products.find(x => x.id === f.product.value); if (!p) return; m.el.querySelector('#trAvail').textContent = 'Disponible à l’origine : ' + num(f.from.value ? q(f.from.value, p.id) : unassigned(p)); };
        f.product.onchange = f.from.onchange = avail; avail();
        m.el.addEventListener('submit', async e => { e.preventDefault(); const { error } = await app.sb.rpc('transfer_stock', { p_from: f.from.value || null, p_to: f.to.value || null, p_product: f.product.value, p_quantity: Number(f.qty.value), p_notes: f.notes.value || null }); if (error) return app.toast(X.explain(error), true); m.close(); app.toast('Transfert enregistré.'); app.navigate('by_location', { silent: true }); });
      };
    }
  };
})();
