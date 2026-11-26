/* Boutique en ligne publique (boutique.html).
   Les visiteurs n'utilisent que 2 fonctions sécurisées : get_public_catalog et place_public_order.
   Le prix est toujours recalculé côté serveur ; le panier est mémorisé sur l'appareil du client. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let CUR = 'FCFA';
  const money = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n || 0)) + ' ' + CUR;
  const waNum = phone => { let d = String(phone || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); else if (!d.startsWith('242') && (d.startsWith('0') || d.length <= 9)) d = '242' + d; return d; };
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const cfg = window.MYRA_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const layer = $('#layer');

  const S = { products: [], categories: [], shop: {}, company: {}, cat: '', q: '', cart: store.get('myra_shop_cart', []), wa: '' };
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
        ${open ? `<div class="pd-qty"><span>Quantité souhaitée</span>${stepper(1)}</div>
        <div class="pd-actions">
          <button type="button" class="btn btn-line" id="pdAdd"><i class="fa-solid fa-basket-shopping" aria-hidden="true"></i> Ajouter au panier</button>
          <button type="button" class="btn btn-green" id="pdBuy">Commander · <b id="pdTotal">${money(p.price)}</b></button>
        </div>` : `<a class="btn btn-green full" href="${esc(waLink(`Bonjour, je souhaite commander : ${p.name}`))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Commander sur WhatsApp</a>`}
      </div>`, 'pd');
    if (!open) return;
    bindStepper(el, v => { qty = v; el.querySelector('#pdTotal').textContent = money(p.price * v); });
    el.querySelector('#pdAdd').onclick = () => { addToCart(p.id, qty); close(); toast(`${p.name} ajouté au panier`); };
    el.querySelector('#pdBuy').onclick = () => { addToCart(p.id, qty); openCheckout(); };
  }

  function openCart() {
    const lines = cartLines();
    if (!lines.length) { sheet(`${closeBtn}<div class="empty"><i class="fa-solid fa-basket-shopping" aria-hidden="true"></i><h2>Votre panier est vide</h2><p>Touchez un produit pour l’ajouter.</p><button type="button" class="btn btn-green" data-close>Voir les produits</button></div>`, 'side'); return; }
    const el = sheet(`${closeBtn}<h2 class="sh-title">Mon panier</h2>
      <div class="lines">${lines.map(l => `<div class="line" data-id="${esc(l.id)}">${thumb(l.p, 'ln-img')}<div class="ln-txt"><b>${esc(l.p.name)}</b><small>${money(l.p.price)}${unitLabel(l.p)}</small>${stepper(l.qty, l.id)}</div><div class="ln-end"><b class="ln-sum">${money(l.p.price * l.qty)}</b><button type="button" class="ln-del" data-del="${esc(l.id)}" aria-label="Retirer ${esc(l.p.name)}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></div></div>`).join('')}</div>
      <div class="sum"><span>Sous-total</span><b id="cartSum">${money(cartTotal())}</b></div>
      <p class="hint"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Frais de livraison confirmés par téléphone.</p>
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
      <div class="recap">${lines.map(l => `<div><span>${l.qty} × ${esc(l.p.name)}</span><b>${money(l.p.price * l.qty)}</b></div>`).join('')}<div class="recap-total"><span>Sous-total</span><b>${money(cartTotal())}</b></div></div>
      <form id="orderForm" novalidate>
        <label class="fld"><span>Nom complet *</span><input name="name" autocomplete="name" required maxlength="120" value="${esc(me.name || '')}" placeholder="Ex. : Grâce Mabiala"></label>
        <div class="two">
          <label class="fld"><span>Téléphone *</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(me.phone || '')}" placeholder="06 123 45 67"></label>
          <label class="fld"><span>WhatsApp</span><input name="whatsapp" type="tel" inputmode="tel" value="${esc(me.whatsapp || '')}" placeholder="Si différent du téléphone"></label>
        </div>
        <label class="check"><input type="checkbox" name="same" ${me.whatsapp ? '' : 'checked'}> Mon numéro WhatsApp est le même que mon téléphone</label>
        <label class="fld"><span>Adresse de livraison *</span><input name="address" autocomplete="street-address" required maxlength="300" value="${esc(me.address || '')}" placeholder="N°, rue, repère (ex. : près de l’église…)"></label>
        <div class="two">
          <label class="fld"><span>Quartier / arrondissement</span><input name="zone" maxlength="80" value="${esc(me.zone || '')}" placeholder="Ex. : Moungali"></label>
          <label class="fld"><span>Livraison souhaitée le</span><input name="date" type="date" min="${minDate}"></label>
        </div>
        <label class="fld"><span>Remarque</span><textarea name="notes" rows="2" maxlength="500" placeholder="Heure préférée, précisions…"></textarea></label>
        <p class="form-err" id="formErr" role="alert" hidden></p>
        <button type="submit" class="btn btn-green full" id="sendOrder"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer ma commande · ${money(cartTotal())}</button>
        <p class="hint center">Aucun paiement en ligne : nous vous appelons pour confirmer le total et la livraison.</p>
      </form>`, 'side');
    const f = el.querySelector('#orderForm'), wa = f.elements.whatsapp, same = f.elements.same;
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
      const btn = el.querySelector('#sendOrder'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Envoi en cours…';
      const items = cartLines().map(l => ({ product_id: l.id, quantity: l.qty }));
      const { data, error } = await sb.rpc('place_public_order', { p_name: v.name.trim(), p_phone: v.phone.trim(), p_whatsapp: same.checked ? '' : (v.whatsapp || '').trim(), p_address: v.address.trim(), p_zone: (v.zone || '').trim(), p_delivery_date: v.date || null, p_notes: (v.notes || '').trim(), p_items: items });
      if (error || !data) {
        btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer ma commande · ${money(cartTotal())}`;
        const msg = error?.message || ''; const friendly = /^[A-ZÀ-Ü][^]*\.$/.test(msg) && !/function|permission|relation|schema|JWT|fetch/i.test(msg);
        err.textContent = friendly ? msg : (navigator.onLine ? 'La commande n’a pas pu être envoyée. Réessayez dans un instant, ou écrivez-nous sur WhatsApp.' : 'Pas de connexion Internet. Vérifiez votre connexion puis réessayez.');
        err.hidden = false; return;
      }
      store.set('myra_shop_me', { name: v.name.trim(), phone: v.phone.trim(), whatsapp: same.checked ? '' : (v.whatsapp || '').trim(), address: v.address.trim(), zone: (v.zone || '').trim() });
      const summary = cartLines().map(l => `• ${l.qty} × ${l.p.name}`).join('\n');
      S.cart = []; saveCart();
      done(data, v, summary);
    };
  }

  function done(r, v, summary) {
    const msg = `Bonjour, je viens de passer la commande ${r.order_number} sur votre boutique en ligne :\n${summary}\nTotal : ${money(r.total)}\nNom : ${v.name.trim()}\nAdresse : ${v.address.trim()}${v.zone ? ' (' + v.zone.trim() + ')' : ''}`;
    const link = waLink(msg);
    sheet(`${closeBtn}<div class="ok">
      <span class="ok-ico"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
      <h2>Merci ${esc(v.name.trim().split(' ')[0])}, commande reçue !</h2>
      <p>Votre numéro de commande</p><p class="ok-num">${esc(r.order_number)}</p>
      <p class="ok-total">Total des produits : <b>${money(r.total)}</b></p>
      <p class="muted">Nous vous appelons très vite au <b>${esc(v.phone.trim())}</b> pour confirmer la commande et la livraison.</p>
      ${link ? `<a class="btn btn-wa full" href="${esc(link)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Recevoir la confirmation sur WhatsApp</a>` : ''}
      <button type="button" class="btn btn-line full" data-close>Continuer mes achats</button></div>`, 'side');
  }

  let toastT = null;
  function toast(msg) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

  /* ---------- Catalogue ---------- */
  function paintChips() {
    const chips = [['', 'Tout']].concat(S.categories.map(c => [c.id, c.name]));
    $('#chips').hidden = S.categories.length < 1;
    $('#chips').innerHTML = chips.map(([id, n]) => `<button type="button" role="tab" aria-selected="${S.cat === id}" class="chip ${S.cat === id ? 'on' : ''}" data-cat="${esc(id)}">${esc(n)}</button>`).join('');
    $('#chips').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { S.cat = b.dataset.cat; paintChips(); paintGrid(); });
  }
  function paintGrid() {
    const q = S.q.trim().toLowerCase();
    const list = S.products.filter(p => (!S.cat || p.category_id === S.cat) && (!q || (p.name + ' ' + (p.description || '') + ' ' + (p.category || '')).toLowerCase().includes(q)));
    $('#grid').innerHTML = list.map(p => `<article class="card">
        <button type="button" class="card-hit" data-open="${esc(p.id)}" aria-label="${esc(p.name)}, ${money(p.price)}"></button>
        <div class="card-media">${thumb(p, 'card-img')}${p.available ? '' : '<span class="tag">Sur commande</span>'}</div>
        <div class="card-body">
          ${p.category ? `<small class="card-cat">${esc(p.category)}</small>` : ''}
          <h3>${esc(p.name)}</h3>
          ${p.description ? `<p class="card-desc">${esc(p.description)}</p>` : ''}
          ${p.reviews ? `<p class="card-rate">${stars(p.rating)} <span>${p.reviews}</span></p>` : ''}
          <div class="card-foot"><p class="price">${money(p.price)}<small>${unitLabel(p)}</small></p><span class="add" aria-hidden="true"><i class="fa-solid fa-plus"></i></span></div>
        </div></article>`).join('') || `<div class="none"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>${S.products.length ? 'Aucun produit ne correspond à votre recherche.' : 'Nos produits arrivent très bientôt.'}</p></div>`;
    $('#grid').querySelectorAll('[data-open]').forEach(b => b.onclick = () => openProduct(b.dataset.open));
  }

  function fill(data) {
    S.shop = data.shop || {}; S.company = data.company || {}; CUR = S.company.currency || 'FCFA';
    S.categories = data.categories || [];
    const cats = new Map(S.categories.map(c => [c.id, c.name]));
    S.products = (data.products || []).map(p => ({ ...p, price: Number(p.price || 0), category: cats.get(p.category_id) || '' }));
    const name = S.company.name || 'Les Saveurs de Myra';
    $('#shopName').textContent = name; $('#footName').textContent = name;
    if (S.shop.headline) $('#heroTitle').textContent = S.shop.headline;
    if (S.shop.intro) $('#heroIntro').textContent = S.shop.intro;
    if (S.shop.delivery) $('#deliveryInfo').textContent = S.shop.delivery + (Number(S.shop.min_order) > 0 ? ` Minimum de commande : ${money(S.shop.min_order)}.` : '');
    S.wa = waNum(S.shop.whatsapp || S.company.phone);
    if (S.wa) { const l = waLink('Bonjour, je souhaite passer une commande.'); ['#heroWa', '#waFloat'].forEach(s => { $(s).href = l; $(s).hidden = false; }); }
    const contact = [S.company.phone && `<a href="tel:${esc(S.company.phone.replace(/\s/g, ''))}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(S.company.phone)}</a>`,
      S.wa && `<a href="${esc(waLink('Bonjour'))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>`,
      S.company.address && !/@/.test(S.company.address) && `<span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(S.company.address)}</span>`].filter(Boolean);
    $('#footContact').innerHTML = contact.join('');
    $('#closedBanner').hidden = S.shop.open !== false;
    $('#catSub').textContent = S.products.length ? `${S.products.length} produit${S.products.length > 1 ? 's' : ''} · touchez un produit pour le commander.` : 'Touchez un produit pour le commander.';
    paintChips(); paintGrid(); paintCart(); productsJsonLd();
    const deep = new URLSearchParams(location.search).get('p'); if (deep && byId(deep)) openProduct(deep);
  }

  /* Données structurées des produits (Google : nom, photo, prix, disponibilité) */
  function productsJsonLd() {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    const data = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Produits ' + (S.company.name || 'Les Saveurs de Myra'),
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
  }

  $('#search').addEventListener('input', e => { S.q = e.target.value; paintGrid(); });
  $('#cartBtn').onclick = openCart; $('#cartBar').onclick = openCart;
  $('#year').textContent = new Date().getFullYear();
  const bar = $('#bar'); addEventListener('scroll', () => bar.classList.toggle('scrolled', scrollY > 10), { passive: true });
  load();
})();
