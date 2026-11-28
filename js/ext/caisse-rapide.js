/* LSM Business Manager V41 — Caisse rapide au comptoir (grands boutons, scan, encaissement en 2 touches)
   et ticket sur petite imprimante thermique Bluetooth (ESC/POS, 58 ou 80 mm). */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num } = X;
  const PAY = [['cash', 'Espèces', 'fa-money-bill-wave'], ['mtn_momo', 'MTN MoMo', 'fa-mobile-screen'], ['airtel_money', 'Airtel', 'fa-mobile-screen-button'], ['credit', 'À crédit', 'fa-handshake']];
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  X.menu('GESTION COMMERCIALE', [['pos', 'Caisse rapide', 'fa-store']]);

  /* ---------- Imprimante thermique Bluetooth (ESC/POS) ---------- */
  const SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb'];
  const P = window.MyraPrinter = {
    ch: null, name: store.get('myra_printer', {}).name || '', width: store.get('myra_printer', {}).width || 32,
    supported: () => !!navigator.bluetooth,
    async connect() {
      if (!navigator.bluetooth) throw new Error('Bluetooth non disponible : utilisez Chrome sur Android (ou un ordinateur avec Bluetooth).');
      const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
      const gatt = await dev.gatt.connect(); let ch = null;
      for (const s of await gatt.getPrimaryServices()) { for (const c of await s.getCharacteristics()) { if (c.properties.write || c.properties.writeWithoutResponse) { ch = c; break; } } if (ch) break; }
      if (!ch) throw new Error('Imprimante non reconnue (aucune sortie d’impression).');
      P.ch = ch; P.name = dev.name || 'Imprimante'; store.set('myra_printer', { name: P.name, width: P.width });
      dev.addEventListener('gattserverdisconnected', () => { P.ch = null; });
      return P.name;
    },
    setWidth(w) { P.width = w; store.set('myra_printer', { name: P.name, width: w }); },
    /* Texte sans accents (jeu de caractères des petites imprimantes) */
    plain: s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").replace(/[«»]/g, '"').replace(/[^\x20-\x7E\n]/g, ''),
    line(l, r = '') { const w = P.width; l = P.plain(l); r = P.plain(r); if (l.length + r.length + 1 > w) l = l.slice(0, Math.max(1, w - r.length - 1)); return l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r; },
    async print(parts) {
      if (!P.ch) await P.connect();
      const enc = new TextEncoder(); const bytes = [];
      const push = a => bytes.push(...a); const text = t => push(enc.encode(P.plain(t) + '\n'));
      push([0x1b, 0x40]);                                  // initialisation
      for (const p of parts) {
        if (p.align) push([0x1b, 0x61, { left: 0, center: 1, right: 2 }[p.align] || 0]);
        if (p.big) push([0x1d, 0x21, 0x11]); if (p.bold) push([0x1b, 0x45, 1]);
        if (p.text != null) String(p.text).split('\n').forEach(text);
        if (p.hr) text('-'.repeat(P.width));
        if (p.big) push([0x1d, 0x21, 0x00]); if (p.bold) push([0x1b, 0x45, 0]);
        if (p.align) push([0x1b, 0x61, 0]);
      }
      push([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);  // avance + coupe (si disponible)
      const data = new Uint8Array(bytes);
      for (let i = 0; i < data.length; i += 120) {
        const chunk = data.slice(i, i + 120);
        if (P.ch.properties.writeWithoutResponse && P.ch.writeValueWithoutResponse) await P.ch.writeValueWithoutResponse(chunk); else await P.ch.writeValue(chunk);
        await new Promise(r => setTimeout(r, 25));
      }
    }
  };
  async function ticketParts(r, lines, company) {
    const parts = [{ align: 'center', big: true, text: company.name || 'Les saveurs de Myra' }, { align: 'center', text: [company.address, company.phone].filter(Boolean).join('\n') }, { hr: true },
      { text: `Ticket ${r.sale_number}\n${new Date().toLocaleString('fr-FR')}` }, { hr: true }];
    lines.forEach(l => parts.push({ text: P.plain(l.name) }, { text: P.line(`  ${num(l.qty)} x ${num(l.price)}`, num(l.qty * l.price)) }));
    parts.push({ hr: true });
    if (Number(r.discount)) parts.push({ text: P.line('Remise', '-' + num(r.discount)) });
    parts.push({ bold: true, text: P.line('TOTAL', num(r.total) + ' FCFA') });
    if (Number(r.paid)) parts.push({ text: P.line('Paye', num(r.paid)) });
    if (Number(r.change)) parts.push({ text: P.line('Monnaie rendue', num(r.change)) });
    if (Number(r.remaining)) parts.push({ bold: true, text: P.line('Reste a payer', num(r.remaining)) });
    parts.push({ hr: true }, { align: 'center', text: 'Merci pour votre achat !\nLe secret de nos marmites' });
    return parts;
  }

  EXT.pages.pos = {
    title: 'Caisse rapide',
    async render(host, app) {
      if (!navigator.onLine) { host.innerHTML = X.head('Caisse rapide', 'La caisse rapide a besoin d’Internet pour encaisser. Utilisez « Ventes » en mode hors connexion.'); return; }
      X.loading(host);
      const [{ data: prods, error }, { data: cats }, { data: custs }, company] = await Promise.all([
        app.sb.from('products').select('id,name,unit,sale_price,stock_quantity,image_url,category_id,barcode,sku').eq('is_active', true).gt('sale_price', 0).order('name'),
        app.sb.from('product_categories').select('id,name').order('name'), app.sb.from('customers').select('id,full_name,phone').order('full_name').limit(2000),
        app.getCompanyDocumentInfo().catch(() => ({}))]);
      if (error) return X.errorPanel(host, error);
      const S = { cart: [], cat: '', q: '', pay: 'cash', customer: null, discount: 0 };
      host.innerHTML = `<div class="pos">
        <section class="pos-left"><div class="pos-tools"><label class="search-wrap"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input class="search-input" id="posQ" type="search" placeholder="Produit, code-barres…" aria-label="Rechercher un produit" autocomplete="off"></label><button type="button" class="btn light" id="posScan" aria-label="Scanner"><i class="fa-solid fa-barcode"></i></button></div>
          <div class="chip-row pos-cats"><button type="button" class="chip on" data-cat="">Tous</button>${(cats || []).map(c => `<button type="button" class="chip" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
          <div class="pos-grid" id="posGrid"></div></section>
        <section class="pos-right card"><div class="card-head"><h3><i class="fa-solid fa-basket-shopping"></i> Vente</h3><button type="button" class="btn light sm" id="posClear">Vider</button></div>
          <div id="posLines" class="pos-lines"></div>
          <label class="field">Client (facultatif)<input list="posCusts" id="posCust" placeholder="Client comptant" autocomplete="off"><datalist id="posCusts">${(custs || []).map(c => `<option value="${esc(c.full_name)}${c.phone ? ' · ' + esc(c.phone) : ''}"></option>`).join('')}</datalist></label>
          <label class="field">Remise (FCFA)<input type="number" min="0" step="50" id="posDisc" value="0" inputmode="numeric"></label>
          <div class="pos-total"><span>Total</span><b id="posTotal">0 FCFA</b></div>
          <div class="pos-pay" role="radiogroup" aria-label="Paiement">${PAY.map(([k, l, i]) => `<button type="button" role="radio" data-pay="${k}" class="${k === 'cash' ? 'on' : ''}" aria-checked="${k === 'cash'}"><i class="fa-solid ${i}"></i>${l}</button>`).join('')}</div>
          <label class="field" id="posRecvWrap">Montant reçu (espèces)<input type="number" min="0" step="50" id="posRecv" inputmode="numeric" placeholder="Pour calculer la monnaie"></label>
          <p class="pos-change" id="posChange"></p>
          <button type="button" class="btn primary full pos-go" id="posGo" disabled><i class="fa-solid fa-check"></i> Encaisser</button>
          <p class="muted small" id="posPrn"></p></section></div>`;
      const custOf = () => { const v = host.querySelector('#posCust').value.trim(); if (!v) return null; return (custs || []).find(c => v === c.full_name + (c.phone ? ' · ' + c.phone : '') || v === c.full_name) || null; };
      const total = () => Math.max(0, S.cart.reduce((n, l) => n + l.price * l.qty, 0) - S.discount);
      const grid = () => { const q = S.q.toLowerCase(); const list = (prods || []).filter(p => (!S.cat || p.category_id === S.cat) && (!q || `${p.name} ${p.barcode || ''} ${p.sku || ''}`.toLowerCase().includes(q)));
        host.querySelector('#posGrid').innerHTML = list.map(p => `<button type="button" class="pos-p ${p.stock_quantity <= 0 ? 'out' : ''}" data-id="${p.id}">${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : `<span class="pos-ini">${esc(p.name.slice(0, 2).toUpperCase())}</span>`}<b>${esc(p.name)}</b><small>${money(p.sale_price)}</small><em>${p.stock_quantity <= 0 ? 'Rupture' : num(p.stock_quantity) + ' en stock'}</em></button>`).join('') || '<p class="muted">Aucun produit.</p>';
        host.querySelectorAll('.pos-p').forEach(b => b.onclick = () => add(b.dataset.id)); };
      const add = id => { const p = prods.find(x => x.id === id); if (!p) return; const l = S.cart.find(x => x.id === id); if (l) l.qty++; else S.cart.push({ id, name: p.name, price: Number(p.sale_price), qty: 1, stock: Number(p.stock_quantity) }); draw(); navigator.vibrate?.(15); };
      const draw = () => {
        host.querySelector('#posLines').innerHTML = S.cart.length ? S.cart.map(l => `<div class="pos-line" data-id="${l.id}"><span><b>${esc(l.name)}</b><small>${money(l.price)}${l.qty > l.stock ? ' · <span class="txt-bad">stock insuffisant</span>' : ''}</small></span><span class="pos-step"><button type="button" data-d="-1" aria-label="Moins">−</button><b>${l.qty}</b><button type="button" data-d="1" aria-label="Plus">+</button></span><b class="pos-lt">${money(l.price * l.qty)}</b></div>`).join('') : '<p class="muted">Touchez un produit pour l’ajouter.</p>';
        host.querySelectorAll('.pos-line [data-d]').forEach(b => b.onclick = () => { const l = S.cart.find(x => x.id === b.closest('.pos-line').dataset.id); l.qty += Number(b.dataset.d); if (l.qty <= 0) S.cart = S.cart.filter(x => x !== l); draw(); });
        host.querySelector('#posTotal').textContent = money(total());
        const recv = Number(host.querySelector('#posRecv').value || 0); const ch = host.querySelector('#posChange');
        ch.innerHTML = S.pay === 'cash' && recv ? (recv >= total() ? `Monnaie à rendre : <b>${money(recv - total())}</b>` : `<span class="txt-warn">Il manque ${money(total() - recv)} : la vente sera en partie à crédit.</span>`) : S.pay === 'credit' ? 'Le client paiera plus tard (suivi dans « Crédit clients »).' : '';
        host.querySelector('#posRecvWrap').hidden = S.pay !== 'cash';
        host.querySelector('#posGo').disabled = !S.cart.length || total() <= 0;
        host.querySelector('#posPrn').innerHTML = P.supported() ? `<i class="fa-brands fa-bluetooth-b"></i> Imprimante : ${P.ch ? esc(P.name) + ' (connectée)' : P.name ? esc(P.name) + ' (sera reconnectée au ticket)' : 'aucune — elle sera demandée au premier ticket'}` : 'Ticket : impression ou partage (Bluetooth non disponible sur ce navigateur).';
      };
      host.querySelector('#posQ').oninput = e => { S.q = e.target.value; grid(); };
      host.querySelector('#posQ').onkeydown = e => { if (e.key === 'Enter') { const code = e.target.value.trim(); const p = prods.find(x => [x.barcode, x.sku].includes(code)) || prods.find(x => x.name.toLowerCase().includes(code.toLowerCase())); if (p) { add(p.id); e.target.value = ''; S.q = ''; grid(); } } };
      host.querySelector('#posScan').onclick = async () => { const code = await X.scan('Scanner un produit'); if (!code) return; const p = prods.find(x => [x.barcode, x.sku, x.id].includes(code) || code.includes(x.id)); p ? add(p.id) : app.toast('Produit introuvable pour ce code.', true); };
      host.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { S.cat = b.dataset.cat; host.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === b)); grid(); });
      host.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => { S.pay = b.dataset.pay; host.querySelectorAll('[data-pay]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); draw(); });
      host.querySelector('#posDisc').oninput = e => { S.discount = Math.max(0, Number(e.target.value || 0)); draw(); };
      host.querySelector('#posRecv').oninput = draw;
      host.querySelector('#posClear').onclick = () => { S.cart = []; draw(); };
      host.querySelector('#posGo').onclick = async e => {
        const b = e.currentTarget; const cust = custOf();
        if (S.pay === 'credit' && !cust) return app.toast('Choisissez le client pour une vente à crédit.', true);
        b.disabled = true; b.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Encaissement…';
        const recv = S.pay === 'cash' && host.querySelector('#posRecv').value !== '' ? Number(host.querySelector('#posRecv').value) : null;
        const lines = S.cart.map(l => ({ ...l }));
        const { data: r, error: er } = await app.sb.rpc('pos_checkout', { p_items: lines.map(l => ({ product_id: l.id, quantity: l.qty })), p_customer: cust?.id || null, p_discount: S.discount, p_method: S.pay, p_received: recv, p_note: null });
        b.innerHTML = '<i class="fa-solid fa-check"></i> Encaisser';
        if (er) { b.disabled = false; return app.toast(X.explain(er), true); }
        lines.forEach(l => { const p = prods.find(x => x.id === l.id); if (p) p.stock_quantity -= l.qty; });
        S.cart = []; S.discount = 0; host.querySelector('#posDisc').value = 0; host.querySelector('#posRecv').value = ''; host.querySelector('#posCust').value = ''; grid(); draw();
        done(r, lines, cust);
      };
      function done(r, lines, cust) {
        const receiptUrl = window.MyraShare?.receiptUrl(r.receipt_token);
        const m = X.modal('Vente enregistrée ✔', `<div class="pos-done"><p class="pos-big">${money(r.total)}</p>${Number(r.change) ? `<p class="pos-change-big">Monnaie à rendre : <b>${money(r.change)}</b></p>` : ''}${Number(r.remaining) ? `<p class="txt-warn">Reste à payer : <b>${money(r.remaining)}</b></p>` : ''}<p class="muted">${esc(r.sale_number)}</p></div>`,
          `<button type="button" class="btn light" id="pdBt"><i class="fa-brands fa-bluetooth-b"></i> Ticket</button><button type="button" class="btn light" id="pdPdf"><i class="fa-solid fa-print"></i> PDF</button><button type="button" class="btn light" id="pdWa"><i class="fa-brands fa-whatsapp"></i> Reçu</button><button type="button" class="btn primary" data-close>Nouvelle vente</button>`);
        m.el.querySelector('#pdBt').onclick = async () => { try { await P.print(await ticketParts(r, lines, company || {})); app.toast('Ticket imprimé.'); } catch (err) { if (err?.name !== 'NotFoundError') app.toast(err.message || 'Impression impossible.', true); } draw(); };
        m.el.querySelector('#pdPdf').onclick = () => X.printDoc({ title: 'Ticket ' + r.sale_number, kicker: 'Ticket de caisse', subtitle: new Date().toLocaleString('fr-FR'), sharePhone: cust?.phone || null,
          sections: [{ table: { head: ['Produit', 'Qté', 'Prix', 'Total'], align: ['', 'r', 'r', 'r'], rows: lines.map(l => [l.name, num(l.qty), money(l.price), money(l.price * l.qty)]) } }],
          totals: [...(Number(r.discount) ? [['Remise', '− ' + money(r.discount)]] : []), ['Total', money(r.total)], ['Payé', money(r.paid)], ...(Number(r.remaining) ? [['Reste à payer', money(r.remaining)]] : [])], pill: Number(r.remaining) ? 'Reste ' + money(r.remaining) : 'Payé' });
        m.el.querySelector('#pdWa').onclick = () => window.MyraShare?.link({ title: 'Reçu ' + r.sale_number, url: receiptUrl, phone: cust?.phone || '', text: `Merci pour votre achat${cust ? ' ' + cust.full_name.split(' ')[0] : ''} ! Total ${money(r.total)}.` });
      }
      grid(); draw(); host.querySelector('#posQ').focus();
    }
  };
})();
