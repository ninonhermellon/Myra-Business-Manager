/* Boutique en ligne publique (boutique.html).
   Les visiteurs n'utilisent que 2 fonctions sécurisées : get_public_catalog et place_public_order.
   Le prix est toujours recalculé côté serveur ; le panier est mémorisé sur l'appareil du client. */
(() => {
  // Un élément retiré de la page ne doit jamais bloquer la boutique : on renvoie alors un élément vide hors page.
  const $ = s => document.querySelector(s) || document.createElement('div');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let CUR = 'FCFA';
  const money = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n || 0)) + ' ' + CUR;
  const waNum = phone => { let d = String(phone || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); else if (!d.startsWith('242') && (d.startsWith('0') || d.length <= 9)) d = '242' + d; return d; };
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const cfg = window.MYRA_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const layer = $('#layer');

  const S = { products: [], categories: [], shop: {}, company: {}, popular: [], promos: [], cat: '', q: '', limit: 12, cart: store.get('myra_shop_cart', []), wa: '', promo: null, promoCode: '', zones: [], pay: 'cash_on_delivery' };
  /* Panier enregistré (relance des paniers abandonnés) : identifiant aléatoire propre à cet appareil */
  const cartToken = () => { let t = store.get('myra_cart_token', ''); if (!/^[0-9a-f-]{36}$/.test(t)) { t = crypto.randomUUID(); store.set('myra_cart_token', t); } return t; };
  let cartTimer = 0;
  const saveRemoteCart = (name, phone) => { clearTimeout(cartTimer); cartTimer = setTimeout(() => { const items = cartLines().map(l => ({ product_id: l.id, quantity: l.qty })); if (items.length && String(phone || '').replace(/\D/g, '').length >= 8) sb.rpc('save_shop_cart', { p_token: cartToken(), p_name: name || null, p_phone: phone, p_items: items }).then(() => {}, () => {}); }, 900); };
  const zoneFee = name => { const z = S.zones.find(x => x.name.toLowerCase() === String(name || '').toLowerCase()); if (!z) return null; const free = Number(S.shop.free_delivery_from || 0); return free && cartTotal() >= free ? 0 : Number(z.fee || 0); };
  const PAYS = () => [S.shop.cash_on_delivery !== false && ['cash_on_delivery', 'À la livraison', 'fa-hand-holding-dollar', 'Espèces ou Mobile Money au livreur'], S.shop.momo_code && ['mtn_momo', 'MTN MoMo', 'fa-mobile-screen', 'Paiement marchand, maintenant'], S.shop.airtel_code && ['airtel_money', 'Airtel Money', 'fa-mobile-screen-button', 'Paiement marchand, maintenant']].filter(Boolean);
  const byId = id => S.products.find(p => p.id === id);
  const unitLabel = p => p.unit ? ` / ${esc(p.unit)}` : '';
  const stars = r => { const n = Math.round(Number(r) || 0); return '<span class="stars" aria-label="' + Number(r).toFixed(1) + ' sur 5">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>'; };
  const thumb = (p, cls = '') => p.image ? `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" data-cls="${cls}">` : `<span class="ph ${cls}"><i class="fa-solid fa-bowl-food" aria-hidden="true"></i></span>`;
  document.addEventListener('error', e => { const img = e.target; if (img.tagName === 'IMG' && img.dataset.cls !== undefined) { const s = document.createElement('span'); s.className = 'ph ' + img.dataset.cls; s.innerHTML = '<i class="fa-solid fa-bowl-food" aria-hidden="true"></i>'; img.replaceWith(s); } }, true);
  const waLink = text => S.wa ? `https://wa.me/${S.wa}?text=${encodeURIComponent(text)}` : '';

  /* ---------- Panier ---------- */
  const cartLines = () => S.cart.map(l => ({ ...l, p: byId(l.id) })).filter(l => l.p);
  const cartTotal = () => cartLines().reduce((n, l) => n + l.p.price * l.qty, 0);
  const cartCount = () => cartLines().reduce((n, l) => n + l.qty, 0);
  function saveCart() { S.cart = cartLines().map(l => ({ id: l.id, qty: l.qty })); store.set('myra_shop_cart', S.cart); paintCart(); }
  function addToCart(id, qty) { const l = S.cart.find(x => x.id === id); if (l) l.qty = Math.min(500, l.qty + qty); else S.cart.push({ id, qty }); saveCart(); }
  function paintCart() {
    const n = cartCount(), open = S.shop.open !== false;
    $('#cartCount').hidden = !n; $('#cartCount').textContent = n;
    $('#cartBar').hidden = !n || !open || !!layer.firstChild;
    $('#cartBarCount').textContent = n + ' article' + (n > 1 ? 's' : '');
    $('#cartBarTotal').textContent = money(cartTotal());
    document.body.classList.toggle('has-cartbar', !$('#cartBar').hidden);
  }

  /* ---------- Fenêtres (fiche produit, panier, commande) ---------- */
  let lastFocus = null;
  function sheet(html, cls = '') {
    lastFocus = document.activeElement;
    layer.innerHTML = `<div class="ov" data-close></div><div class="sheet ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.classList.add('locked'); paintCart();
    layer.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    const f = layer.querySelector('.sheet [autofocus], .sheet button, .sheet input'); setTimeout(() => f?.focus({ preventScroll: true }), 30);
    return layer.querySelector('.sheet');
  }
  function close() { layer.innerHTML = ''; document.body.classList.remove('locked'); paintCart(); lastFocus?.focus?.({ preventScroll: true }); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && layer.firstChild) close(); });
  const closeBtn = '<button type="button" class="x" data-close aria-label="Fermer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>';
  const stepper = (val, id = '') => `<div class="qty" ${id ? `data-line="${esc(id)}"` : ''}><button type="button" data-step="-1" aria-label="Diminuer">−</button><input type="number" inputmode="numeric" min="1" max="500" value="${val}" aria-label="Quantité"><button type="button" data-step="1" aria-label="Augmenter">+</button></div>`;
  function bindStepper(root, onChange) {
    root.querySelectorAll('.qty').forEach(q => {
      const inp = q.querySelector('input');
      const set = v => { v = Math.max(1, Math.min(500, Math.round(Number(v) || 1))); inp.value = v; onChange(v, q.dataset.line); };
      q.querySelectorAll('[data-step]').forEach(b => b.onclick = () => set(Number(inp.value) + Number(b.dataset.step)));
      inp.onchange = () => set(inp.value);
    });
  }

  function openProduct(id) {
    const p = byId(id); if (!p) return;
    const open = S.shop.open !== false; let qty = 1;
    const el = sheet(`${closeBtn}
      <div class="pd-media">${thumb(p, 'pd-img')}</div>
      <div class="pd-body">
        ${p.category ? `<small class="pd-cat">${esc(p.category)}</small>` : ''}
        <h2>${esc(p.name)}</h2>
        ${p.reviews ? `<p class="pd-rate">${stars(p.rating)} <span>${Number(p.rating).toFixed(1)} · ${p.reviews} avis</span></p>` : ''}
        <p class="pd-price">${money(p.price)}<small>${unitLabel(p)}</small></p>
        ${p.available ? '' : '<p class="pd-note"><i class="fa-solid fa-clock" aria-hidden="true"></i> Préparé sur commande : nous vous confirmons le délai par téléphone.</p>'}
        ${p.description ? `<p class="pd-desc">${esc(p.description)}</p>` : ''}
        ${p.bundle ? `<div class="pd-bundle"><b><i class="fa-solid fa-gift" aria-hidden="true"></i> Dans ce coffret</b><ul>${p.bundle.map(i => `<li>${Number(i.quantity)} × ${esc(i.name)}</li>`).join('')}</ul>${Number(p.value) > p.price ? `<p class="pd-save">Valeur ${money(p.value)} · vous économisez <b>${money(Number(p.value) - p.price)}</b></p>` : ''}</div>` : ''}
        ${open ? `<div class="pd-qty"><span>Quantité souhaitée</span>${stepper(1)}</div>
        <div class="pd-actions">
          <button type="button" class="btn btn-line" id="pdAdd"><i class="fa-solid fa-basket-shopping" aria-hidden="true"></i> Ajouter au panier</button>
          <button type="button" class="btn btn-green" id="pdBuy">Commander · <b id="pdTotal">${money(p.price)}</b></button>
        </div>` : `<a class="btn btn-green full" href="${esc(waLink(`Bonjour, je souhaite commander : ${p.name}`))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Commander sur WhatsApp</a>`}
        <section class="pd-rev" id="pdReviews" aria-label="Avis clients"><div class="rv-head"><h3>Avis clients</h3><button type="button" class="btn btn-ghost btn-sm" id="pdRate"><i class="fa-regular fa-star" aria-hidden="true"></i> Donner mon avis</button></div><div id="rvBody"><p class="muted">Chargement des avis…</p></div></section>
      </div>`, 'pd');
    loadReviews(p, el);
    if (!open) return;
    bindStepper(el, v => { qty = v; el.querySelector('#pdTotal').textContent = money(p.price * v); });
    el.querySelector('#pdAdd').onclick = () => { addToCart(p.id, qty); close(); toast(`${p.name} ajouté au panier`); };
    el.querySelector('#pdBuy').onclick = () => { addToCart(p.id, qty); openCheckout(); };
  }

  /* ---------- Avis clients (fiche produit) ---------- */
  async function loadReviews(p, el) {
    const A = window.MyraAvis, body = el.querySelector('#rvBody'); if (!A || !body) return;
    el.querySelector('#pdRate').onclick = () => openReviewForm(p);
    const { data, error } = await sb.rpc('get_product_reviews', { p_product_id: p.id });
    if (!body.isConnected) return;
    if (error || !data) { body.innerHTML = '<p class="muted">Avis indisponibles pour le moment.</p>'; return; }
    body.innerHTML = A.summary(data.summary) + `<div class="rv-list">${A.list(data.reviews)}</div>`;
  }
  function openReviewForm(p) {
    const A = window.MyraAvis; const me = store.get('myra_shop_me', {});
    const el = sheet(`${closeBtn}<h2 class="sh-title">Votre avis</h2><p class="rv-prod">${thumb(p, 'ln-img')}<span><small>Vous notez</small><b>${esc(p.name)}</b></span></p>
      <form id="rvForm" novalidate>${A.CRITERIA.map(A.starInput).join('')}
        <label class="fld"><span>Votre commentaire</span><textarea name="comment" rows="3" maxlength="1000" placeholder="Ce que vous avez aimé, ce que nous pouvons améliorer…"></textarea></label>
        <div class="two"><label class="fld"><span>Prénom *</span><input name="name" autocomplete="given-name" maxlength="80" value="${esc((me.name || '').split(' ')[0] || '')}" required></label>
        <label class="fld"><span>Téléphone *</span><input name="phone" type="tel" inputmode="tel" value="${esc(me.phone || '')}" placeholder="Jamais affiché" required></label></div>
        <p class="hint">Seuls votre prénom et l’initiale de votre nom sont publiés. Le téléphone sert à vérifier votre achat (badge « Achat vérifié »).</p>
        <p class="form-err" id="rvErr" role="alert" hidden></p>
        <button type="submit" class="btn btn-green full" id="rvSend"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Publier mon avis</button></form>`, 'side');
    const get = A.bind(el); const f = el.querySelector('#rvForm'), err = el.querySelector('#rvErr');
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true; const v = Object.fromEntries(new FormData(f)); const d = get();
      const bad = m => { err.textContent = m; err.hidden = false; };
      if (!d.product) return bad('Touchez une étoile pour noter le produit.');
      if ((v.name || '').trim().length < 2) return bad('Indiquez votre prénom.');
      if (String(v.phone || '').replace(/\D/g, '').length < 8) return bad('Indiquez votre numéro de téléphone.');
      const btn = el.querySelector('#rvSend'); btn.disabled = true;
      const { data, error } = await sb.rpc('submit_product_review', { p_product_id: p.id, p_name: v.name.trim(), p_phone: v.phone.trim(), p_details: d, p_comment: (v.comment || '').trim() || null });
      btn.disabled = false;
      if (error || !data) { const m = error?.message || ''; return bad(/^[A-ZÀ-Ü][^]*[.!]$/.test(m) && !/function|permission|schema/i.test(m) ? m : 'Avis non envoyé. Réessayez dans un instant.'); }
      sheet(`${closeBtn}<div class="ok"><span class="ok-ico"><i class="fa-solid fa-heart" aria-hidden="true"></i></span><h2>Merci ${esc(v.name.trim())} !</h2><p>Votre avis sur <b>${esc(p.name)}</b> est publié${data.verified ? ' avec le badge « Achat vérifié »' : ''}.</p><p class="muted">Il nous aide à améliorer nos produits et notre service.</p><button type="button" class="btn btn-green full" id="rvBack">Revoir le produit</button></div>`, 'side');
      layer.querySelector('#rvBack').onclick = () => { load(); openProduct(p.id); };
    };
  }

  function openCart() {
    const lines = cartLines();
    if (!lines.length) { sheet(`${closeBtn}<div class="empty"><i class="fa-solid fa-basket-shopping" aria-hidden="true"></i><h2>Votre panier est vide</h2><p>Touchez un produit pour l’ajouter.</p><button type="button" class="btn btn-green" data-close>Voir les produits</button></div>`, 'side'); return; }
    const el = sheet(`${closeBtn}<h2 class="sh-title">Mon panier</h2>
      <div class="lines">${lines.map(l => `<div class="line" data-id="${esc(l.id)}">${thumb(l.p, 'ln-img')}<div class="ln-txt"><b>${esc(l.p.name)}</b><small>${money(l.p.price)}${unitLabel(l.p)}</small>${stepper(l.qty, l.id)}</div><div class="ln-end"><b class="ln-sum">${money(l.p.price * l.qty)}</b><button type="button" class="ln-del" data-del="${esc(l.id)}" aria-label="Retirer ${esc(l.p.name)}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></div></div>`).join('')}</div>
      <div class="sum"><span>Sous-total</span><b id="cartSum">${money(cartTotal())}</b></div>
      <p class="hint"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${S.zones.length ? `Livraison selon votre quartier : dès ${money(Math.min(...S.zones.map(z => Number(z.fee))))}${Number(S.shop.free_delivery_from) ? ` · offerte dès ${money(S.shop.free_delivery_from)} d’achats` : ''}.` : 'Frais de livraison confirmés par téléphone.'}</p>
      <button type="button" class="btn btn-green full" id="toCheckout">Passer la commande <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`, 'side');
    bindStepper(el, (v, id) => { const l = S.cart.find(x => x.id === id); if (l) l.qty = v; saveCart(); const row = el.querySelector(`.line[data-id="${id}"]`); row.querySelector('.ln-sum').textContent = money(byId(id).price * v); el.querySelector('#cartSum').textContent = money(cartTotal()); });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { S.cart = S.cart.filter(x => x.id !== b.dataset.del); saveCart(); openCart(); });
    el.querySelector('#toCheckout').onclick = openCheckout;
  }

  function openCheckout() {
    const lines = cartLines(); if (!lines.length) return openCart();
    const me = store.get('myra_shop_me', {});
    const minDate = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const el = sheet(`${closeBtn}<h2 class="sh-title">Finaliser ma commande</h2>
      <div class="recap" id="recap"></div>
      <form id="orderForm" novalidate>
        <label class="fld" for="promoCode"><span>Code promo</span></label><div class="promo-fld"><input id="promoCode" name="promo" maxlength="30" autocomplete="off" placeholder="Facultatif" value="${esc(S.promoCode || '')}" class="fldx"><button type="button" class="btn btn-ghost btn-sm" id="promoApply">Appliquer</button></div><p class="promo-msg" id="promoMsg" hidden></p>
        <label class="fld"><span>Nom complet *</span><input name="name" autocomplete="name" required maxlength="120" value="${esc(me.name || '')}" placeholder="Ex. : Grâce Mabiala"></label>
        <div class="two">
          <label class="fld"><span>Téléphone *</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(me.phone || '')}" placeholder="06 123 45 67"></label>
          <label class="fld"><span>WhatsApp</span><input name="whatsapp" type="tel" inputmode="tel" value="${esc(me.whatsapp || '')}" placeholder="Si différent du téléphone"></label>
        </div>
        <label class="check"><input type="checkbox" name="same" ${me.whatsapp ? '' : 'checked'}> Mon numéro WhatsApp est le même que mon téléphone</label>
        <label class="fld"><span>Adresse de livraison *</span><input name="address" autocomplete="street-address" required maxlength="300" value="${esc(me.address || '')}" placeholder="N°, rue, repère (ex. : près de l’église…)"></label>
        <div class="two">
          ${S.zones.length ? `<label class="fld"><span>Quartier *</span><select name="zone" required><option value="">Choisissez…</option>${S.zones.map(z => `<option value="${esc(z.name)}" ${String(me.zone || '').toLowerCase() === z.name.toLowerCase() ? 'selected' : ''}>${esc(z.name)} · ${Number(z.fee) ? money(z.fee) : 'offerte'}${z.delay ? ' · ' + esc(z.delay) : ''}</option>`).join('')}</select></label>` : `<label class="fld"><span>Quartier / arrondissement</span><input name="zone" maxlength="80" value="${esc(me.zone || '')}" placeholder="Ex. : Moungali"></label>`}
          <label class="fld"><span>Livraison souhaitée le</span><input name="date" type="date" min="${minDate}"></label>
        </div>
        <label class="fld"><span>Remarque</span><textarea name="notes" rows="2" maxlength="500" placeholder="Heure préférée, précisions…"></textarea></label>
        <fieldset class="pay"><legend>Paiement</legend><div class="pay-opts">${PAYS().map(([k, l, i, d]) => `<label class="pay-opt"><input type="radio" name="pay" value="${k}" ${k === (PAYS().some(x => x[0] === S.pay) ? S.pay : PAYS()[0]?.[0]) ? 'checked' : ''}><span><i class="fa-solid ${i}" aria-hidden="true"></i><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
          <div class="momo" id="momoBox" hidden></div></fieldset>
        <label class="fld"><span>Recevoir cette commande régulièrement ?</span><select name="sub"><option value="">Non, une seule fois</option><option value="weekly">Oui, chaque semaine</option><option value="biweekly">Oui, toutes les 2 semaines</option><option value="monthly">Oui, chaque mois</option></select></label>
        <p class="form-err" id="formErr" role="alert" hidden></p>
        <button type="submit" class="btn btn-green full" id="sendOrder"></button>
        <p class="hint center" id="payHint">Nous vous appelons pour confirmer la commande et l’heure de livraison.</p>
      </form>`, 'side');
    const f = el.querySelector('#orderForm'), wa = f.elements.whatsapp, same = f.elements.same;
    const fee = () => S.zones.length ? zoneFee(f.elements.zone.value) : null;
    const due = () => Math.max(0, cartTotal() - (S.promo?.discount || 0)) + (fee() || 0);
    const sendLabel = () => `<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer ma commande · ${money(due())}`;
    const paintRecap = () => {
      el.querySelector('#recap').innerHTML = cartLines().map(l => `<div><span>${l.qty} × ${esc(l.p.name)}</span><b>${money(l.p.price * l.qty)}</b></div>`).join('')
        + (S.promo ? `<div class="disc"><span>Code ${esc(S.promo.code)} (${esc(S.promo.name)})</span><b>− ${money(S.promo.discount)}</b></div>` : '')
        + (S.zones.length ? `<div><span>Livraison${f.elements.zone.value ? ' · ' + esc(f.elements.zone.value) : ''}</span><b>${fee() === null ? 'selon le quartier' : fee() ? money(fee()) : 'offerte'}</b></div>` : '')
        + `<div class="recap-total"><span>${S.zones.length ? 'Total à payer' : S.promo ? 'Total des produits' : 'Sous-total'}</span><b>${money(due())}</b></div>`;
      el.querySelector('#sendOrder').innerHTML = sendLabel(); paintPay();
    };
    function paintPay() {
      const k = f.querySelector('[name=pay]:checked')?.value || 'cash_on_delivery'; S.pay = k; const box = el.querySelector('#momoBox');
      if (k === 'cash_on_delivery') { box.hidden = true; box.innerHTML = ''; el.querySelector('#payHint').textContent = 'Vous payez à la livraison (espèces ou Mobile Money au livreur).'; return; }
      const momo = k === 'mtn_momo'; const code = momo ? S.shop.momo_code : S.shop.airtel_code;
      const keep = { ref: box.querySelector('[name=ref]')?.value || '', payer: box.querySelector('[name=payer]')?.value || '', mode: box.querySelector('[name=momomode]:checked')?.value || 'api' };
      box.hidden = false;
      if (momo && S.momoApi) {
        box.innerHTML = `<p class="momo-amt">Montant à payer : <b>${money(due())}</b></p>
          <div class="momo-modes"><label><input type="radio" name="momomode" value="api" ${keep.mode === 'api' ? 'checked' : ''}> <b>Recevoir la demande de paiement sur mon téléphone</b> <small>(recommandé : vous validez avec votre code MoMo)</small></label>
          <label><input type="radio" name="momomode" value="manual" ${keep.mode === 'manual' ? 'checked' : ''}> J’ai déjà payé au code marchand <b>${esc(code)}</b></label></div>
          ${keep.mode === 'manual' ? `<div class="two"><label class="fld"><span>Référence de la transaction *</span><input name="ref" maxlength="40" autocomplete="off" placeholder="Ex. : MP2611.1234.A56789" value="${esc(keep.ref)}"></label><label class="fld"><span>Numéro qui a payé</span><input name="payer" type="tel" inputmode="tel" placeholder="06 …" value="${esc(keep.payer)}"></label></div>`
            : `<label class="fld"><span>Numéro MTN MoMo qui va payer *</span><input name="payer" type="tel" inputmode="tel" placeholder="06 …" value="${esc(keep.payer || f.elements.phone.value)}"></label>`}`;
        box.querySelectorAll('[name=momomode]').forEach(r => r.onchange = paintPay);
        el.querySelector('#payHint').textContent = keep.mode === 'manual' ? 'Nous vérifions votre paiement puis vous appelons pour la livraison.' : 'Après « Envoyer », validez la demande MTN MoMo qui s’affiche sur votre téléphone.';
        return;
      }
      box.innerHTML = `<p class="momo-amt">Montant à payer : <b>${money(due())}</b></p>
        <ol class="momo-steps"><li>Ouvrez ${momo ? 'MTN MoMo (application ou menu USSD MTN)' : 'Airtel Money'} et choisissez <b>« Payer un marchand »</b>.</li>
          <li>Code marchand : <b class="momo-code">${esc(code)}</b> <button type="button" class="btn btn-ghost btn-xs" data-copy="${esc(code)}">Copier</button>${momo && S.shop.momo_name ? `<br><small>Nom affiché : <b>${esc(S.shop.momo_name)}</b></small>` : ''}</li>
          <li>Montant : <b>${money(due())}</b>, puis validez avec votre code secret.</li>
          <li>Recopiez ci-dessous la <b>référence (ID de transaction)</b> reçue par SMS.</li></ol>
        ${momo && S.shop.momo_number ? `<p class="hint">Vous pouvez aussi faire un transfert au <b>${esc(S.shop.momo_number)}</b>${S.shop.momo_name ? ' (' + esc(S.shop.momo_name) + ')' : ''}.</p>` : ''}
        ${S.shop.momo_instructions ? `<p class="hint">${esc(S.shop.momo_instructions)}</p>` : ''}
        <div class="two"><label class="fld"><span>Référence de la transaction *</span><input name="ref" maxlength="40" autocomplete="off" placeholder="Ex. : MP2611.1234.A56789" value="${esc(keep.ref)}"></label>
        <label class="fld"><span>Numéro qui a payé</span><input name="payer" type="tel" inputmode="tel" placeholder="06 …" value="${esc(keep.payer)}"></label></div>`;
      box.querySelector('[data-copy]').onclick = async e => { try { await navigator.clipboard.writeText(e.currentTarget.dataset.copy); e.currentTarget.textContent = 'Copié ✔'; } catch (_) {} };
      el.querySelector('#payHint').textContent = 'Nous vérifions votre paiement puis vous appelons pour la livraison.';
    }
    f.addEventListener('change', e => { if (e.target.name === 'pay' || e.target.name === 'zone') paintRecap(); });
    f.addEventListener('input', e => { if (e.target.name === 'phone' || e.target.name === 'name') saveRemoteCart(f.elements.name.value.trim(), f.elements.phone.value.trim()); });
    if (me.phone) saveRemoteCart(me.name, me.phone);
    const promoMsg = (txt, ok) => { const m = el.querySelector('#promoMsg'); m.textContent = txt; m.className = 'promo-msg ' + (ok ? 'ok' : 'bad'); m.hidden = !txt; };
    async function applyPromo(silent) {
      const code = el.querySelector('#promoCode').value.trim().toUpperCase(); S.promoCode = code;
      if (!code) { S.promo = null; promoMsg(''); return paintRecap(); }
      const { data, error } = await sb.rpc('check_public_promo', { p_code: code, p_subtotal: cartTotal() });
      if (error || !data) { S.promo = null; if (!silent) promoMsg(/^[A-ZÀ-Ü]/.test(error?.message || '') && !/function|permission/i.test(error.message) ? error.message : 'Code promo indisponible pour le moment.', false); return paintRecap(); }
      S.promo = { code: data.code, name: data.name, discount: Number(data.discount || 0) }; promoMsg(`Code appliqué : − ${money(S.promo.discount)}`, true); paintRecap();
    }
    el.querySelector('#promoApply').onclick = () => applyPromo(false);
    el.querySelector('#promoCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(false); } });
    paintRecap(); if (S.promoCode) applyPromo(true);
    const syncWa = () => { wa.closest('.fld').classList.toggle('dim', same.checked); wa.disabled = same.checked; if (same.checked) wa.value = ''; };
    same.onchange = syncWa; syncWa();
    f.addEventListener('input', e => { e.target.closest('.fld')?.classList.remove('bad'); el.querySelector('#formErr').hidden = true; });
    f.onsubmit = async e => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f)); const err = el.querySelector('#formErr');
      const bad = (name, msg) => { err.textContent = msg; err.hidden = false; f.elements[name]?.focus(); f.elements[name]?.closest('.fld')?.classList.add('bad'); return false; };
      f.querySelectorAll('.bad').forEach(x => x.classList.remove('bad')); err.hidden = true;
      const digits = s => String(s || '').replace(/\D/g, '');
      if ((v.name || '').trim().length < 2) return bad('name', 'Indiquez votre nom.');
      if (digits(v.phone).length < 8 || digits(v.phone).length > 15) return bad('phone', 'Numéro de téléphone invalide.');
      if (!same.checked && v.whatsapp && (digits(v.whatsapp).length < 8 || digits(v.whatsapp).length > 15)) return bad('whatsapp', 'Numéro WhatsApp invalide.');
      if ((v.address || '').trim().length < 3) return bad('address', 'Indiquez votre adresse de livraison.');
      if (S.zones.length && !v.zone) return bad('zone', 'Choisissez votre quartier de livraison.');
      const pay = v.pay || 'cash_on_delivery';
      const momoApi = pay === 'mtn_momo' && S.momoApi && (v.momomode || 'api') === 'api';
      if (momoApi && digits(v.payer).length < 8) return bad('payer', 'Indiquez le numéro MTN MoMo qui va payer.');
      if (pay !== 'cash_on_delivery' && !momoApi && (v.ref || '').replace(/[^A-Za-z0-9]/g, '').length < 4) return bad('ref', 'Indiquez la référence de la transaction reçue par SMS après le paiement.');
      const btn = el.querySelector('#sendOrder'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Envoi en cours…';
      const items = cartLines().map(l => ({ product_id: l.id, quantity: l.qty }));
      const args = { p_name: v.name.trim(), p_phone: v.phone.trim(), p_whatsapp: same.checked ? '' : (v.whatsapp || '').trim(), p_address: v.address.trim(), p_zone: (v.zone || '').trim(), p_delivery_date: v.date || null, p_notes: (v.notes || '').trim(), p_items: items };
      if (S.promo) args.p_promo_code = S.promo.code;
      if (pay !== 'cash_on_delivery') { args.p_payment_method = pay; args.p_payment_reference = momoApi ? 'APP' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase() : (v.ref || '').trim(); if ((v.payer || '').trim()) args.p_payer_phone = v.payer.trim(); }
      if (v.sub) args.p_subscription = v.sub;
      args.p_cart_token = cartToken();
      const { data, error } = await sb.rpc('place_public_order', args);
      if (error || !data) {
        btn.disabled = false; btn.innerHTML = sendLabel();
        const msg = error?.message || ''; const friendly = /^[A-ZÀ-Ü][^]*\.$/.test(msg) && !/function|permission|relation|schema|JWT|fetch/i.test(msg);
        err.textContent = friendly ? msg : (navigator.onLine ? 'La commande n’a pas pu être envoyée. Réessayez dans un instant, ou écrivez-nous sur WhatsApp.' : 'Pas de connexion Internet. Vérifiez votre connexion puis réessayez.');
        err.hidden = false; return;
      }
      store.set('myra_shop_me', { name: v.name.trim(), phone: v.phone.trim(), whatsapp: same.checked ? '' : (v.whatsapp || '').trim(), address: v.address.trim(), zone: (v.zone || '').trim() });
      const summary = cartLines().map(l => `• ${l.qty} × ${l.p.name}`).join('\n');
      try { const r = store.get('myra_shop_orders', []).filter(x => x !== data.order_number); r.unshift(data.order_number); localStorage.setItem('myra_shop_orders', JSON.stringify(r.slice(0, 6))); } catch (_) {}
      S.cart = []; S.promo = null; S.promoCode = ''; saveCart(); store.set('myra_cart_token', '');
      if (momoApi) return momoWait(data, v, summary);
      done(data, v, summary);
    };
  }

  /* Paiement MTN MoMo automatique : demande envoyée au téléphone du client, puis vérification toutes les 4 secondes */
  async function momoWait(r, v, summary) {
    const sh = () => sheet(`${closeBtn}<div class="ok momo-wait"><span class="ok-ico"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i></span><h2>Validez le paiement sur votre téléphone</h2>
      <p>Une demande de <b>${money(r.total)}</b> a été envoyée au <b>${esc(v.payer)}</b>. Saisissez votre code secret MTN MoMo pour confirmer.</p><p class="muted" id="mwState"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> En attente de votre validation…</p>
      <button type="button" class="btn btn-ghost full" id="mwSkip">Payer plus tard / au code marchand</button></div>`, 'side');
    sh(); let stop = false; layer.querySelector('#mwSkip').onclick = () => { stop = true; done({ ...r, payment_status: 'to_verify' }, v, summary); };
    const fail = m => { if (stop) return; stop = true; done({ ...r, payment_status: 'to_verify', momo_error: m }, v, summary); };
    const { data: q, error } = await sb.functions.invoke('myra-momo', { body: { action: 'request', order_number: r.order_number, phone: v.phone, payer: v.payer } });
    if (error || !q?.reference) { let m = 'La demande MTN MoMo n’a pas pu être envoyée.'; try { m = (await error?.context?.json())?.error || q?.error || m; } catch (_) {} return fail(m); }
    const t0 = Date.now();
    while (!stop && Date.now() - t0 < 180000) {
      await new Promise(res => setTimeout(res, 4000)); if (stop) return;
      const { data: st } = await sb.functions.invoke('myra-momo', { body: { action: 'status', reference: q.reference } }).catch(() => ({}));
      if (st?.status === 'SUCCESSFUL') { stop = true; return done({ ...r, payment_status: 'paid' }, v, summary); }
      if (st?.status === 'FAILED' || st?.status === 'REJECTED') return fail('Paiement refusé ou annulé sur le téléphone.');
    }
    fail('Nous n’avons pas encore reçu la validation.');
  }

  function done(r, v, summary) {
    const msg = `Bonjour, je viens de passer la commande ${r.order_number} sur votre boutique en ligne :\n${summary}\nTotal : ${money(r.total)}${r.payment_method && r.payment_method !== 'cash_on_delivery' ? '\nPayé par ' + (r.payment_method === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money') + ' (réf. ' + (v.ref || '').trim() + ')' : ''}\nNom : ${v.name.trim()}\nAdresse : ${v.address.trim()}${v.zone ? ' (' + v.zone.trim() + ')' : ''}`;
    const link = waLink(msg);
    sheet(`${closeBtn}<div class="ok">
      <span class="ok-ico"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
      <h2>Merci ${esc(v.name.trim().split(' ')[0])}, commande reçue !</h2>
      <p>Votre numéro de commande</p><p class="ok-num">${esc(r.order_number)}</p>
      <p class="ok-total">Total : <b>${money(r.total)}</b>${Number(r.delivery_fee) ? ` <small class="muted">(livraison ${money(r.delivery_fee)} incluse)</small>` : ''}${Number(r.discount) ? ` <small class="muted">(remise ${money(r.discount)} incluse)</small>` : ''}</p>
      ${r.payment_status === 'paid' ? '<p class="ok-pay"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Paiement MTN MoMo reçu ✔ Merci !</p>' : ''}
      ${r.momo_error ? `<p class="ok-pay warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(r.momo_error)} Vous pouvez payer au code marchand <b>${esc(S.shop.momo_code || '')}</b> puis nous envoyer la référence sur WhatsApp.</p>` : ''}
      ${r.payment_status === 'to_verify' && !r.momo_error ? '<p class="ok-pay"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i> Paiement Mobile Money reçu : nous le vérifions et vous confirmons la livraison.</p>' : ''}
      ${r.subscription ? '<p class="ok-pay"><i class="fa-solid fa-repeat" aria-hidden="true"></i> Votre demande d’abonnement est enregistrée : nous vous appelons pour la confirmer.</p>' : ''}
      <p class="muted">Nous vous appelons très vite au <b>${esc(v.phone.trim())}</b> pour confirmer la commande et la livraison.</p>
      ${link ? `<a class="btn btn-wa full" href="${esc(link)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Recevoir la confirmation sur WhatsApp</a>` : ''}
      <a class="btn btn-line full" href="commande.html?n=${encodeURIComponent(r.order_number)}"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Suivre ma commande</a>
      <button type="button" class="btn btn-ghost full" data-close>Continuer mes achats</button></div>`, 'side');
  }

  let toastT = null;
  function toast(msg) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

  /* ---------- Catalogue ---------- */
  const card = (p, rank) => `<article class="card">
      <button type="button" class="card-hit" data-open="${esc(p.id)}" aria-label="${esc(p.name)}, ${money(p.price)}"></button>
      ${rank ? `<span class="rank" aria-hidden="true">${rank}</span>` : ''}
      <div class="card-media">${thumb(p, 'card-img')}${!p.available ? '<span class="tag">Sur commande</span>' : p.bundle ? '<span class="tag gift"><i class="fa-solid fa-gift" aria-hidden="true"></i> Coffret</span>' : p.is_new ? '<span class="tag new">Nouveau</span>' : ''}</div>
      <div class="card-body">
        ${p.category ? `<small class="card-cat">${esc(p.category)}</small>` : ''}
        <h3>${esc(p.name)}</h3>
        ${p.description && !rank ? `<p class="card-desc">${esc(p.description)}</p>` : ''}
        ${p.reviews ? `<p class="card-rate">${stars(p.rating)} <span>${p.reviews} avis</span></p>` : ''}
        <p class="price">${money(p.price)}<small>${p.unit ? '/ ' + esc(p.unit) : ''}</small></p>
        ${S.shop.open !== false ? `<button type="button" class="add" data-add="${esc(p.id)}"><i class="fa-solid fa-basket-shopping" aria-hidden="true"></i> Ajouter au panier</button>` : ''}
      </div></article>`;
  function bindCards(root) {
    root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openProduct(b.dataset.open));
    root.querySelectorAll('[data-add]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const p = byId(b.dataset.add); addToCart(p.id, 1); toast(`${p.name} ajouté au panier`);
      b.classList.add('done'); b.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Ajouté'; setTimeout(() => { b.classList.remove('done'); b.innerHTML = '<i class="fa-solid fa-basket-shopping" aria-hidden="true"></i> Ajouter au panier'; }, 1600);
    });
  }
  function setCat(id, scroll) { S.cat = id; S.limit = 12; $('#searchCat').value = id; paintChips(); paintCats(); paintGrid(); if (scroll) $('#produits').scrollIntoView({ behavior: 'smooth' }); }
  function paintChips() {
    const chips = [['', 'Tout']].concat(S.categories.map(c => [c.id, c.name]));
    $('#chips').hidden = S.categories.length < 1;
    $('#chips').innerHTML = chips.map(([id, n]) => `<button type="button" role="tab" aria-selected="${S.cat === id}" class="chip ${S.cat === id ? 'on' : ''}" data-cat="${esc(id)}">${esc(n)}</button>`).join('');
    $('#chips').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => setCat(b.dataset.cat));
  }
  function paintCats() {
    const firstImg = id => (S.products.find(p => (!id || p.category_id === id) && p.image) || {}).image;
    const tiles = S.categories.map(c => ({ id: c.id, name: c.name, img: c.image || firstImg(c.id), n: c.count ?? S.products.filter(p => p.category_id === c.id).length }));
    const all = { id: '', name: 'Tous les produits', img: '', n: S.products.length, icon: 'fa-border-all' };
    $('#cats').innerHTML = [...tiles, all].map(t => `<button type="button" class="cat ${S.cat === t.id ? 'on' : ''}" data-tile="${esc(t.id)}"><span class="cat-img">${t.img ? `<img src="${esc(t.img)}" alt="" loading="lazy">` : `<i class="fa-solid ${t.icon || 'fa-jar'}" aria-hidden="true"></i>`}</span><b>${esc(t.name)}</b><small>${t.n} produit${t.n > 1 ? 's' : ''}</small></button>`).join('');
    $('#cats').querySelectorAll('[data-tile]').forEach(b => b.onclick = () => setCat(b.dataset.tile, true));
  }
  function paintGrid() {
    const q = S.q.trim().toLowerCase();
    const list = S.products.filter(p => (!S.cat || p.category_id === S.cat) && (!q || (p.name + ' ' + (p.description || '') + ' ' + (p.category || '')).toLowerCase().includes(q)));
    $('#grid').innerHTML = list.slice(0, S.limit).map(p => card(p)).join('') || `<div class="none"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>${S.products.length ? 'Aucun produit ne correspond à votre recherche.' : 'Nos produits arrivent très bientôt.'}</p></div>`;
    $('#moreBtn').hidden = list.length <= S.limit; $('#moreBtn').textContent = `Voir plus (${list.length - S.limit})`;
    $('#catSub').textContent = `${list.length} produit${list.length > 1 ? 's' : ''}${S.cat ? ' · ' + (S.categories.find(c => c.id === S.cat)?.name || '') : ''}`;
    bindCards($('#grid'));
  }
  function paintHero() {
    const art = $('#heroArt'), withImg = S.products.filter(p => p.image), minPrice = Math.min(...S.products.map(p => p.price).filter(Boolean));
    const rated = S.products.filter(p => p.reviews); const avg = rated.length ? rated.reduce((n, p) => n + p.rating * p.reviews, 0) / rated.reduce((n, p) => n + p.reviews, 0) : 0;
    let inner = '<div class="ha-bg"></div>';
    if (S.shop.hero_image) inner += `<img class="ha-cover" src="${esc(S.shop.hero_image)}" alt="">`;
    else if (document.querySelector('#heroArt .ha-cover')) inner = `<img class="ha-cover" src="assets/hero-marinade.jpg" alt="Marinade universelle Les saveurs de Myra, 100 % naturelle">`;
    else if (withImg.length) inner += `<img class="ha-main" src="${esc(withImg[0].image)}" alt="">` + (withImg[1] ? `<img class="ha-side a" src="${esc(withImg[1].image)}" alt="">` : '') + (withImg[2] ? `<img class="ha-side b" src="${esc(withImg[2].image)}" alt="">` : '');
    else inner += '<img class="ha-logo" src="assets/logo-les-saveurs-de-myra.png" alt="">';
    if (isFinite(minPrice) && !inner.includes('hero-marinade')) inner += `<div class="ha-badge">À partir de<b>${money(minPrice)}</b></div>`;
    if (avg) inner += `<div class="ha-rate"><i class="fa-solid fa-star" aria-hidden="true"></i> ${avg.toFixed(1)} / 5 · ${rated.reduce((n, p) => n + p.reviews, 0)} avis</div>`;
    art.innerHTML = inner;
  }
  const promoLabel = pr => pr.type === 'percent' ? `− ${Number(pr.value)} %` : `− ${money(pr.value)}`;
  function usePromo(code) { S.promoCode = code; toast(`Code ${code} : il sera appliqué à votre commande`); $('#produits').scrollIntoView({ behavior: 'smooth' }); }
  function paintPromos() {
    const imgs = S.products.filter(p => p.image).map(p => p.image);
    const banners = S.promos.slice(0, 2).map((pr, i) => ({ chip: promoLabel(pr) + (Number(pr.min_order) ? ` dès ${money(pr.min_order)}` : ''), title: pr.name, text: pr.description || 'Offre valable sur toute la boutique.', code: pr.code, img: imgs[i] || imgs[0] }));
    const defaults = [{ chip: 'Fait maison', title: 'Le goût de la tradition', text: 'Recettes maison préparées avec soin, comme à la maison.', icon: 'fa-hand-holding-heart', img: imgs[0] }, { chip: 'Brazzaville', title: 'Livré chez vous', text: S.shop.delivery || 'Livraison à domicile, frais confirmés par téléphone.', icon: 'fa-motorcycle', img: imgs[1] }];
    while (banners.length < 2) banners.push(defaults[banners.length]);
    $('#promos').innerHTML = banners.map((b, i) => `<div class="promo ${i ? 'mint' : ''}"><div class="promo-txt"><span class="promo-chip">${esc(b.chip)}</span><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p>${b.code ? `<span class="promo-code">${esc(b.code)}</span><button type="button" class="btn btn-green btn-sm" data-code="${esc(b.code)}">J’en profite <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>` : `<a class="btn btn-green btn-sm" href="#produits">Découvrir <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>`}</div>${b.img ? `<img class="promo-img" src="${esc(b.img)}" alt="" loading="lazy">` : `<i class="fa-solid ${b.icon || 'fa-tag'} promo-ico" aria-hidden="true"></i>`}</div>`).join('');
    $('#promos').querySelectorAll('[data-code]').forEach(b => b.onclick = () => usePromo(b.dataset.code));
    $('#navPromo').hidden = !S.promos.length;
  }
  let cdTimer = null;
  function paintCountdown() {
    clearInterval(cdTimer);
    const pr = S.promos.filter(x => x.ends_at && new Date(x.ends_at) - Date.now() < 31 * 864e5).sort((a, b) => a.ends_at.localeCompare(b.ends_at))[0];
    $('#compte').hidden = !pr; if (!pr) return;
    const img = (S.products.find(p => p.image) || {}).image;
    $('#countdown').innerHTML = `<div class="cd-card"><span class="promo-chip">${esc(promoLabel(pr))} · offre limitée</span><h2>${esc(pr.name)}</h2><p>${esc(pr.description || 'Profitez-en avant la fin de l’offre !')}</p><div class="cd" id="cd" role="timer" aria-live="off"></div><p class="muted">Code <span class="promo-code">${esc(pr.code)}</span></p><button type="button" class="btn btn-green" data-code="${esc(pr.code)}">J’en profite <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div><div class="cd-img">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<img src="assets/logo-les-saveurs-de-myra.png" alt="" style="width:50%;border-radius:50%">'}</div>`;
    $('#countdown [data-code]').onclick = () => usePromo(pr.code);
    const tick = () => { let t = Math.max(0, Math.floor((new Date(pr.ends_at) - Date.now()) / 1000)); const d = Math.floor(t / 86400); t %= 86400; const h = Math.floor(t / 3600); t %= 3600; const m = Math.floor(t / 60), sec = t % 60; const f = n => String(n).padStart(2, '0');
      $('#cd').innerHTML = [[f(d), 'Jours'], [f(h), 'Heures'], [f(m), 'Minutes'], [f(sec), 'Secondes']].map(([v, l], i) => `${i ? '<span>:</span>' : ''}<div><b>${v}</b><small>${l}</small></div>`).join(''); if (!t) clearInterval(cdTimer); };
    tick(); cdTimer = setInterval(tick, 1000);
  }
  function paintPopular() {
    const list = S.popular.map(byId).filter(Boolean).slice(0, 4);
    $('#populaires').hidden = !list.length; $('#navPop').hidden = !list.length; if (!list.length) return;
    $('#popGrid').innerHTML = list.map((p, i) => card(p, i + 1)).join(''); bindCards($('#popGrid'));
  }

  function fill(data) {
    S.shop = data.shop || {}; S.company = data.company || {}; CUR = S.company.currency || 'FCFA';
    S.categories = data.categories || []; S.popular = data.popular || []; S.promos = data.promos || []; S.zones = data.zones || [];
    const cats = new Map(S.categories.map(c => [c.id, c.name]));
    S.products = (data.products || []).map(p => ({ ...p, price: Number(p.price || 0), category: cats.get(p.category_id) || '' }));
    const name = S.company.name || 'Les saveurs de Myra';
    $('#shopName').textContent = name; $('#footName').textContent = name;
    if (S.shop.headline) { const words = S.shop.headline.trim().split(/\s+/); const last = words.pop(); $('#heroTitle').innerHTML = `${esc(words.join(' '))} <span class="hl">${esc(last)}<svg viewBox="0 0 200 14" aria-hidden="true" preserveAspectRatio="none"><path d="M3 10 C 50 2, 120 2, 197 8" /></svg></span>`; }
    if (S.shop.intro) { $('#heroIntro').textContent = S.shop.intro; $('#footIntro').textContent = S.shop.intro; }
    if (S.shop.announcement) $('#annonce').innerHTML = `<i class="fa-solid fa-bullhorn" aria-hidden="true"></i>${esc(S.shop.announcement)}`;
    if (S.shop.delivery) $('#deliveryInfo').textContent = S.shop.delivery + (Number(S.shop.min_order) > 0 ? ` Minimum de commande : ${money(S.shop.min_order)}.` : '');
    S.wa = waNum(S.shop.whatsapp || S.company.phone);
    if (S.wa) { const l = waLink('Bonjour, je souhaite passer une commande.'); ['#heroWa', '#waFloat', '#waTop', '#footWa'].forEach(s => { $(s).href = l; $(s).hidden = false; }); }
    if (S.company.phone) { const a = $('#anPhone'); a.href = 'tel:' + S.company.phone.replace(/\s/g, ''); const sp = a.querySelector('span'); if (sp) sp.textContent = S.company.phone; a.hidden = false; }
    $('#footContact').innerHTML = [S.company.phone && `<li><a href="tel:${esc(S.company.phone.replace(/\s/g, ''))}"><i class="fa-solid fa-phone" aria-hidden="true"></i>${esc(S.company.phone)}</a></li>`,
      S.wa && `<li><a href="${esc(waLink('Bonjour'))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>WhatsApp</a></li>`,
      S.company.email && `<li><a href="mailto:${esc(S.company.email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i>${esc(S.company.email)}</a></li>`,
      S.company.address && !/@/.test(S.company.address) && `<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${esc(S.company.address)}</li>`,
      S.shop.hours && `<li><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(S.shop.hours)}</li>`].filter(Boolean).join('');
    $('#socials').innerHTML = [['facebook', 'fa-facebook-f', 'Facebook'], ['instagram', 'fa-instagram', 'Instagram'], ['tiktok', 'fa-tiktok', 'TikTok']].filter(([k]) => /^https:\/\//.test(S.shop[k] || '')).map(([k, i, l]) => `<a href="${esc(S.shop[k])}" target="_blank" rel="noopener" aria-label="${l}"><i class="fa-brands ${i}" aria-hidden="true"></i></a>`).join('') + (S.wa ? `<a href="${esc(waLink('Bonjour'))}" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>` : '');
    $('#searchCat').innerHTML = '<option value="">Toutes catégories</option>' + S.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('#searchCat').value = S.cat;
    $('#closedBanner').hidden = S.shop.open !== false;
    paintHero(); paintCats(); paintPromos(); paintChips(); paintGrid(); paintCountdown(); paintPopular(); paintCart(); productsJsonLd();
    const deep = new URLSearchParams(location.search).get('p'); if (deep && byId(deep) && !layer.firstChild) openProduct(deep);
  }

  /* Données structurées des produits (Google : nom, photo, prix, disponibilité) */
  function productsJsonLd() {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    const data = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Produits ' + (S.company.name || 'Les saveurs de Myra'),
      itemListElement: S.products.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: {
        '@type': 'Product', name: p.name, description: p.description || undefined, image: p.image || undefined, category: p.category || undefined,
        url: base + 'boutique.html?p=' + encodeURIComponent(p.id),
        aggregateRating: p.reviews ? { '@type': 'AggregateRating', ratingValue: Number(p.rating).toFixed(1), reviewCount: p.reviews } : undefined,
        offers: { '@type': 'Offer', price: Number(p.price).toFixed(0), priceCurrency: 'XAF', availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', areaServed: 'Brazzaville' } } })) };
    let el = document.getElementById('productsLd');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'productsLd'; document.head.appendChild(el); }
    el.textContent = JSON.stringify(data);
  }

  async function load() {
    const cached = store.get('myra_shop_catalog', null);
    if (cached) fill(cached);
    const { data, error } = await sb.rpc('get_public_catalog');
    if (error || !data) {
      if (!cached) $('#grid').innerHTML = `<div class="none"><i class="fa-solid fa-wifi" aria-hidden="true"></i><p>Impossible de charger les produits pour le moment.</p><button type="button" class="btn btn-green" id="retry">Réessayer</button></div>`;
      $('#retry')?.addEventListener('click', load); return;
    }
    store.set('myra_shop_catalog', data); fill(data);
    sb.rpc('get_public_momo_api').then(r => { S.momoApi = !!r.data; }, () => {});
  }

  $('#search').addEventListener('input', e => { S.q = e.target.value; S.limit = 12; paintGrid(); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); S.q = $('#search').value; paintGrid(); $('#produits').scrollIntoView({ behavior: 'smooth' }); });
  $('#searchCat').addEventListener('change', e => setCat(e.target.value, true));
  $('#moreBtn').addEventListener('click', () => { S.limit += 12; paintGrid(); });
  const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
  addEventListener('scroll', () => { const y = scrollY + 170; let cur = navLinks[0]; navLinks.forEach(a => { const t = document.querySelector(a.getAttribute('href')); if (t && !t.hidden && t.offsetTop <= y) cur = a; }); navLinks.forEach(a => a.classList.toggle('on', a === cur)); }, { passive: true });
  /* Menu hamburger (téléphone) */
  const navEl = document.querySelector('.nav'), burger = document.getElementById('menuBtn');
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open); burger?.setAttribute('aria-expanded', String(open));
    if (open) { navEl?.querySelector('a')?.focus({ preventScroll: true }); } else burger?.focus({ preventScroll: true });
  }
  burger?.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  document.querySelector('.nav-ov')?.addEventListener('click', () => setMenu(false));
  document.querySelector('.nav-close')?.addEventListener('click', () => setMenu(false));
  navEl?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { if (document.body.classList.contains('menu-open')) setMenu(false); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false); });
  addEventListener('resize', () => { if (innerWidth > 860 && document.body.classList.contains('menu-open')) setMenu(false); });
  $('#searchToggle').addEventListener('click', e => { const open = document.body.classList.toggle('search-open'); e.currentTarget.setAttribute('aria-expanded', String(open)); if (open) setTimeout(() => $('#search').focus(), 50); });
  $('#cartBtn').onclick = openCart; $('#cartBar').onclick = openCart;
  $('#year').textContent = new Date().getFullYear();
  load();
})();
