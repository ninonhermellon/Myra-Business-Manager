/* LSM Business Manager V41 — Retours et remboursements clients */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num } = X;
  const METHOD = { cash: 'Espèces', mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', bank_transfer: 'Virement', voucher: 'Avoir / bon d’achat' };
  const REASONS = ['Produit abîmé ou cassé', 'Produit périmé ou altéré', 'Erreur de produit', 'Client insatisfait du goût', 'Commande en double', 'Autre'];
  X.menu('GESTION COMMERCIALE', [['returns', 'Retours & remboursements', 'fa-rotate-left']]);
  const canDo = () => ['owner', 'admin', 'manager', 'sales'].includes(A()?.state?.profile?.role);

  async function openReturn(app, number, onDone) {
    const { data: s, error } = await app.sb.rpc('get_sale_for_return', { p_number: number });
    if (error) return app.toast(X.explain(error), true);
    const items = s.items.filter(i => Number(i.quantity) > Number(i.returned));
    if (!items.length) return app.toast('Tous les produits de cette vente ont déjà été retournés.', true);
    const maxRefund = Math.max(0, Number(s.amount_paid) - Number(s.refunded));
    const m = X.modal('Retour · ' + s.sale_number, `<p class="muted">${esc(s.customer || 'Client comptant')} · ${new Date(s.sale_date).toLocaleDateString('fr-FR')} · total ${money(s.total)} · encaissé ${money(s.amount_paid)}${Number(s.refunded) ? ' · déjà remboursé ' + money(s.refunded) : ''}</p>
        <h4 class="pm-sub">Produits retournés</h4>${items.map(i => `<div class="cc-line"><span>${esc(i.name)} <small class="muted">(${num(Number(i.quantity) - Number(i.returned))} max · ${money(i.unit_price)})</small></span><input type="number" min="0" max="${Number(i.quantity) - Number(i.returned)}" step="1" value="0" data-pid="${i.product_id}" data-price="${i.unit_price}" aria-label="Quantité retournée ${esc(i.name)}"></div>`).join('')}
        <div class="form-grid"><label class="field full-span">Motif<select name="reason">${REASONS.map(r => `<option>${r}</option>`).join('')}</select></label>
        <label class="field full-span is-check"><span class="fl">Remettre les produits en stock (s’ils sont vendables)</span><input type="checkbox" name="restock" checked></label>
        <label class="field">Rembourser (FCFA)<input name="refund" type="number" min="0" step="1" value="0" inputmode="numeric"></label>
        <label class="field">Mode de remboursement<select name="method">${Object.entries(METHOD).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field full-span">Remarque<input name="notes" maxlength="300"></label></div><p class="muted small" id="rtInfo"></p>`,
      '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit"><i class="fa-solid fa-rotate-left"></i> Enregistrer le retour</button>', { form: true, wide: true });
    const f = m.el.elements; let auto = true;
    const sync = () => { const v = [...m.el.querySelectorAll('[data-pid]')].reduce((n, i) => n + Number(i.value || 0) * Number(i.dataset.price), 0); const max = Math.min(v, maxRefund);
      if (auto) f.refund.value = Math.round(max); m.el.querySelector('#rtInfo').textContent = `Valeur retournée : ${money(v)} · remboursement maximum : ${money(max)}${f.method.value === 'voucher' ? ' · un avoir ne sort pas d’argent de la caisse' : ''}`; };
    m.el.addEventListener('input', e => { if (e.target.name === 'refund') auto = false; sync(); }); m.el.addEventListener('change', sync); sync();
    m.el.onsubmit = async e => { e.preventDefault();
      const lines = [...m.el.querySelectorAll('[data-pid]')].map(i => ({ product_id: i.dataset.pid, quantity: Number(i.value || 0) })).filter(l => l.quantity > 0);
      if (!lines.length) return app.toast('Indiquez la quantité retournée.', true);
      const b = m.el.querySelector('[type=submit]'); b.disabled = true;
      const { data: r, error: er } = await app.sb.rpc('create_sale_return', { p_sale: s.id, p_items: lines, p_reason: f.reason.value, p_refund: Number(f.refund.value || 0), p_method: f.method.value, p_restock: f.restock.checked, p_notes: f.notes.value || null });
      if (er) { b.disabled = false; return app.toast(X.explain(er), true); }
      m.close(); app.toast(`Retour ${r.return_number} enregistré${Number(r.refund) ? ' · remboursé ' + money(r.refund) : ''}.`);
      printReturn({ ...r, sale_number: s.sale_number, customer: s.customer, reason: f.reason.value, method: f.method.value, lines: lines.map(l => ({ ...l, name: items.find(i => i.product_id === l.product_id)?.name, price: Number(items.find(i => i.product_id === l.product_id)?.unit_price) })) });
      onDone?.();
    };
  }
  function printReturn(r) {
    X.printDoc({ title: 'Avoir ' + r.return_number, kicker: 'Retour client', subtitle: 'Vente ' + r.sale_number, blocks: [['Client', r.customer || 'Client comptant'], ['Motif', r.reason], ['Remboursement', Number(r.refund) ? money(r.refund) + ' · ' + (METHOD[r.method] || r.method) : 'Aucun']],
      sections: [{ title: 'Produits retournés', table: { head: ['Produit', 'Qté', 'Prix', 'Total'], align: ['', 'r', 'r', 'r'], rows: (r.lines || []).map(l => [l.name, num(l.quantity), money(l.price), money(l.price * l.quantity)]) } }],
      totals: [['Valeur retournée', money(r.items_total)], ['Remboursé', money(r.refund)]], signatures: ['Le client', 'Pour Les saveurs de Myra'] });
  }
  X.openReturn = openReturn;

  EXT.pages.returns = {
    title: 'Retours & remboursements',
    async render(host, app) {
      host.innerHTML = X.head('Retours & remboursements', 'Produit retourné : il revient en stock, l’argent remboursé sort de la caisse, et le motif est gardé pour améliorer la qualité.', canDo() ? '<button type="button" class="btn primary" id="rtNew"><i class="fa-solid fa-plus"></i> Nouveau retour</button>' : '') + '<div id="rtKpis"></div><div class="ds-grid"><section class="card"><div class="card-head"><h3>Retours récents</h3></div><div id="rtList"></div></section><section class="card"><div class="card-head"><h3><i class="fa-solid fa-magnifying-glass-chart"></i> Motifs (90 jours)</h3></div><div id="rtWhy"></div></section></div>';
      async function load() {
        const box = host.querySelector('#rtList'); X.loading(box);
        const { data, error } = await app.sb.from('sale_returns').select('*,sales(sale_number),customers(full_name),sale_return_items(product_name,quantity,unit_price,line_total)').order('created_at', { ascending: false }).limit(200);
        if (error) return X.errorPanel(box, error);
        const rows = data || []; const d90 = rows.filter(r => new Date(r.created_at) > new Date(Date.now() - 90 * 864e5));
        host.querySelector('#rtKpis').innerHTML = X.kpis([['fa-rotate-left', 'Retours (90 j)', d90.length, 'enregistrés', 'k-amber'], ['fa-coins', 'Remboursé (90 j)', money(d90.reduce((n, r) => n + Number(r.refund_amount), 0)), 'sorti de la caisse', 'k-pink'], ['fa-box', 'Valeur retournée', money(d90.reduce((n, r) => n + Number(r.items_total), 0)), 'produits', 'k-blue'], ['fa-warehouse', 'Remis en stock', d90.filter(r => r.restock).length, 'retours', 'k-green']]);
        box.innerHTML = rows.length ? rows.map(r => `<div class="m-row" data-id="${r.id}"><span class="m-txt"><b>${esc(r.return_number)} · ${esc(r.customers?.full_name || 'Client comptant')}</b><small>Vente ${esc(r.sales?.sale_number || '')} · ${esc(r.reason)} · ${(r.sale_return_items || []).map(i => num(i.quantity) + ' × ' + esc(i.product_name)).join(', ')}</small><small class="muted">${new Date(r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${Number(r.refund_amount) ? 'remboursé ' + money(r.refund_amount) + ' (' + esc(METHOD[r.refund_method] || r.refund_method) + ')' : 'sans remboursement'}${r.restock ? ' · remis en stock' : ''}</small></span><button type="button" class="btn light sm" data-print aria-label="Imprimer l’avoir"><i class="fa-solid fa-print"></i></button></div>`).join('') : '<p class="muted">Aucun retour enregistré.</p>';
        box.querySelectorAll('[data-print]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id === b.closest('[data-id]').dataset.id); printReturn({ return_number: r.return_number, sale_number: r.sales?.sale_number, customer: r.customers?.full_name, reason: r.reason, method: r.refund_method, refund: r.refund_amount, items_total: r.items_total, lines: (r.sale_return_items || []).map(i => ({ name: i.product_name, quantity: i.quantity, price: i.unit_price })) }); });
        const why = {}; d90.forEach(r => { why[r.reason] = (why[r.reason] || 0) + 1; });
        host.querySelector('#rtWhy').innerHTML = Object.keys(why).length ? Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="cc-line"><span>${esc(k)}</span><b>${v}</b></div>`).join('') + '<p class="muted small">Le motif le plus fréquent indique quoi améliorer en priorité.</p>' : '<p class="muted">Pas de retour sur 90 jours. 👍</p>';
      }
      host.querySelector('#rtNew')?.addEventListener('click', () => {
        const m = X.modal('Nouveau retour', '<label class="field">Numéro de la vente<input name="n" required placeholder="Ex. : VTE-20261127-AB12CD" autocomplete="off"></label><p class="muted small">Le numéro figure sur le reçu ou le ticket du client.</p>', '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Continuer</button>', { form: true });
        m.el.onsubmit = e => { e.preventDefault(); const n = m.el.elements.n.value.trim(); m.close(); openReturn(app, n, load); };
      });
      load();
    }
  };
})();
