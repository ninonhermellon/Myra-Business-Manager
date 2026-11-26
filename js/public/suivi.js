/* Suivi de commande public (commande.html) : numéro de commande + téléphone → état, articles, montants.
   Une seule fonction sécurisée : get_public_order (aucune autre donnée n'est accessible). */
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let CUR = 'FCFA';
  const money = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n || 0)) + ' ' + CUR;
  const fdate = v => v ? new Date(v).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const fdt = v => v ? new Date(v).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } } };
  const cfg = window.MYRA_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const STEPS = [['draft', 'Commande reçue', 'fa-receipt'], ['confirmed', 'Confirmée', 'fa-circle-check'], ['processing', 'En préparation', 'fa-kitchen-set'], ['ready', 'Prête', 'fa-box'], ['out_for_delivery', 'En livraison', 'fa-motorcycle'], ['delivered', 'Livrée', 'fa-house-circle-check']];
  const HEAD = { draft: ['Commande bien reçue', 'Nous vous appelons très vite pour la confirmer.', 'fa-receipt'], confirmed: ['Commande confirmée', 'Elle sera préparée très bientôt.', 'fa-circle-check'], processing: ['En préparation', 'Nos marmites sont au travail !', 'fa-kitchen-set'], ready: ['Commande prête', 'Elle part bientôt en livraison.', 'fa-box'], out_for_delivery: ['Votre commande est en route', 'Le livreur arrive bientôt chez vous.', 'fa-motorcycle'], delivered: ['Commande livrée', 'Merci et bonne dégustation !', 'fa-house-circle-check'], cancelled: ['Commande annulée', 'Contactez-nous pour toute question.', 'fa-circle-xmark'] };

  const form = $('#trackForm'), out = $('#result'), err = $('#trackErr');
  const params = new URLSearchParams(location.search); const me = store.get('myra_shop_me', {});
  if (params.get('n')) form.number.value = params.get('n'); if (me.phone) form.phone.value = me.phone;
  const recent = store.get('myra_shop_orders', []);
  if (recent.length) { $('#recent').hidden = false; $('#recent').innerHTML = '<span>Mes dernières commandes :</span>' + recent.slice(0, 4).map(n => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join(''); $('#recent').querySelectorAll('[data-n]').forEach(b => b.onclick = () => { form.number.value = b.dataset.n; form.requestSubmit(); }); }

  function render(o) {
    CUR = o.company?.currency || 'FCFA';
    const alias = { pending: 'draft', preparing: 'processing', in_delivery: 'out_for_delivery' };
    const st = o.status === 'converted' ? (o.sale_status === 'paid' ? 'delivered' : 'confirmed') : (alias[o.status] || o.status);
    const [h, sub, ico] = HEAD[st] || HEAD.draft; const idx = STEPS.findIndex(s => s[0] === st); const cancelled = st === 'cancelled';
    const wa = window.MyraSite?.wa; const help = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour, je souhaite des nouvelles de ma commande ${o.number}.`)}` : '';
    out.innerHTML = `<div class="tr-hero ${cancelled ? 'bad' : ''}"><span class="ill"><i class="fa-solid ${ico}" aria-hidden="true"></i></span><h2>${esc(h)}</h2><p>${o.customer ? esc(o.customer) + ', ' : ''}${esc(sub)}</p></div>
      ${cancelled ? '' : `<ol class="tl" aria-label="Avancement">${STEPS.map(([k, l, i], n) => `<li class="${n < idx ? 'done' : n === idx ? 'cur' : ''}"><span><i class="fa-solid ${n < idx ? 'fa-check' : i}" aria-hidden="true"></i></span><b>${esc(l)}</b></li>`).join('')}</ol>`}
      <section class="box"><div class="box-h">Articles <span class="muted">${o.items.length}</span></div>${o.items.map(i => `<div class="tr-item"><span class="th">${i.image ? `<img src="${esc(i.image)}" alt="">` : esc((i.name || '?').slice(0, 2).toUpperCase())}</span><span class="tx">${i.unit ? `<small>${esc(i.unit)}</small>` : ''}<b>${esc(i.name)}</b><em>${Number(i.quantity)} × ${money(i.price)}</em></span><b class="am">${money(i.total)}</b></div>`).join('')}</section>
      <section class="box soft"><div class="box-h">Récapitulatif</div>
        <div class="kv"><span>N° de commande</span><b>${esc(o.number)}</b></div>
        <div class="kv"><span>Passée le</span><b>${esc(fdt(o.created_at || o.order_date))}</b></div>
        ${o.requested_delivery_at ? `<div class="kv"><span>Livraison souhaitée</span><b>${esc(fdate(o.requested_delivery_at))}</b></div>` : ''}
        <div class="kv"><span>Adresse de livraison</span><b>${esc([o.delivery_address, o.delivery_zone].filter(Boolean).join(' · ') || '—')}</b></div>
        <div class="kv"><span>Dernière mise à jour</span><b>${esc(fdt(o.updated_at))}</b></div></section>
      <section class="box"><div class="box-h">Montants</div>
        <div class="kv"><span>Produits</span><b>${money(o.subtotal)}</b></div>
        ${Number(o.discount) ? `<div class="kv ok"><span>Remise</span><b>− ${money(o.discount)}</b></div>` : ''}
        <div class="kv"><span>Livraison</span><b>${Number(o.delivery_fee) ? money(o.delivery_fee) : 'confirmée par téléphone'}</b></div>
        <div class="kv tot"><span>Total</span><b>${money(o.total)}</b></div>
        ${o.paid != null && Number(o.paid) > 0 ? `<div class="kv ok"><span>Déjà payé</span><b>${money(o.paid)}</b></div>` : ''}</section>
      <div class="tr-actions">${help ? `<a class="btn btn-wa" href="${esc(help)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Une question ? WhatsApp</a>` : ''}<a class="btn btn-ghost" href="boutique.html"><i class="fa-solid fa-store" aria-hidden="true"></i> Retour à la boutique</a></div>
      <p class="tr-state ${cancelled ? 'bad' : ''}">${cancelled ? 'Commande annulée' : idx >= 0 ? `Étape ${idx + 1} sur ${STEPS.length} · ${esc(STEPS[idx][1])}` : ''}</p>`;
    out.hidden = false; out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault(); err.hidden = true;
    const num = form.number.value.trim().toUpperCase(), phone = form.phone.value.trim();
    if (num.length < 4) { err.textContent = 'Indiquez le numéro de commande (ex. : WEB-20261126-ABC123).'; err.hidden = false; return form.number.focus(); }
    if (phone.replace(/\D/g, '').length < 8) { err.textContent = 'Indiquez le téléphone utilisé pour la commande.'; err.hidden = false; return form.phone.focus(); }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const label = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Recherche…';
    const { data, error } = await sb.rpc('get_public_order', { p_number: num, p_phone: phone });
    btn.disabled = false; btn.innerHTML = label;
    if (error || !data) { out.hidden = true; const m = error?.message || ''; err.textContent = /^[A-ZÀ-Ü][^]*\.$/.test(m) && !/function|permission|schema/i.test(m) ? m : (navigator.onLine ? 'Recherche impossible pour le moment. Réessayez dans un instant.' : 'Pas de connexion Internet.'); err.hidden = false; return; }
    try { const r = store.get('myra_shop_orders', []).filter(x => x !== data.number); r.unshift(data.number); localStorage.setItem('myra_shop_orders', JSON.stringify(r.slice(0, 6))); } catch (_) {}
    history.replaceState(null, '', '?n=' + encodeURIComponent(data.number));
    render(data);
  });
  if (params.get('n') && form.phone.value) form.requestSubmit();
})();
