/* Les saveurs de Myra — en-tête et pied de page communs des pages publiques (suivi, avis, espace client).
   Les coordonnées viennent du catalogue public (mis en cache par la boutique), sans connexion requise. */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const waNum = phone => { let d = String(phone || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); else if (!d.startsWith('242') && (d.startsWith('0') || d.length <= 9)) d = '242' + d; return d; };
  const page = document.body.dataset.page || '';
  const top = document.getElementById('siteTop'), foot = document.getElementById('siteFoot');
  if (top) top.outerHTML = `<header class="top"><div class="wrap top-row">
      <a class="brand" href="boutique.html" aria-label="Les saveurs de Myra, boutique"><img src="assets/icons/public-192.png" alt="" width="46" height="46"><span><b class="js-name">Les saveurs de Myra</b><small>FAIT MAISON · BRAZZAVILLE</small></span></a>
      <div class="acts" style="margin-left:auto">
        <a class="act ${page === 'suivi' ? 'on' : ''}" href="commande.html" title="Suivre ma commande"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><span class="lbl">Suivi</span></a>
        <a class="act js-wa" href="#" target="_blank" rel="noopener" title="WhatsApp" hidden><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>
        <a class="act cart" href="boutique.html"><i class="fa-solid fa-store" aria-hidden="true"></i><span class="lbl">Boutique</span></a>
      </div></div></header>`;
  if (foot) foot.outerHTML = `<footer class="foot"><div class="wrap"><div class="foot-grid">
      <div><div class="foot-brand"><img src="assets/icons/public-192.png" alt="" width="54" height="54"><b class="js-name">Les saveurs de Myra</b></div><p class="js-intro">Le secret de nos marmites : produits traditionnels faits maison à Brazzaville.</p></div>
      <div><h4>Boutique</h4><ul><li><a href="boutique.html">Tous les produits</a></li><li><a href="boutique.html#offres">Promotions</a></li><li><a href="commande.html">Suivre ma commande</a></li></ul></div>
      <div><h4>Aide</h4><ul><li><a href="boutique.html#livraison">Comment commander</a></li><li><a href="#" class="js-wa-link" target="_blank" rel="noopener">Nous écrire sur WhatsApp</a></li></ul></div>
      <div><h4>Contact</h4><ul class="js-contact"></ul></div></div>
      <div class="foot-bottom"><span>© ${new Date().getFullYear()} Les saveurs de Myra · Tous droits réservés</span></div></div></footer>`;

  function apply(d) {
    const c = d?.company || {}, s = d?.shop || {}; const name = c.name || 'Les saveurs de Myra'; const wa = waNum(s.whatsapp || c.phone);
    document.querySelectorAll('.js-name').forEach(e => { e.textContent = name; });
    if (s.intro) document.querySelectorAll('.js-intro').forEach(e => { e.textContent = s.intro; });
    const link = wa ? `https://wa.me/${wa}?text=${encodeURIComponent('Bonjour Les saveurs de Myra')}` : '';
    document.querySelectorAll('.js-wa').forEach(e => { if (link) { e.href = link; e.hidden = false; } });
    document.querySelectorAll('.js-wa-link').forEach(e => { if (link) e.href = link; else e.closest('li')?.remove(); });
    document.querySelectorAll('.js-contact').forEach(ul => { ul.innerHTML = [c.phone && `<li><a href="tel:${esc(c.phone.replace(/\s/g, ''))}"><i class="fa-solid fa-phone" aria-hidden="true"></i>${esc(c.phone)}</a></li>`, link && `<li><a href="${esc(link)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>WhatsApp</a></li>`, c.email && `<li><a href="mailto:${esc(c.email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i>${esc(c.email)}</a></li>`, c.address && !/@/.test(c.address) && `<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${esc(c.address)}</li>`, s.hours && `<li><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(s.hours)}</li>`].filter(Boolean).join(''); });
    window.MyraSite = { wa, link, company: c, shop: s };
    document.dispatchEvent(new CustomEvent('myra:site', { detail: window.MyraSite }));
  }
  /* Accueil utile quand la page est ouverte sans lien personnel (ou avec un lien expiré) */
  const WA_DEFAULT = '242069007022';
  window.MyraLanding = (kind, reason) => {
    let c = null; try { c = JSON.parse(localStorage.getItem('myra_shop_catalog') || 'null'); } catch (_) {}
    const wa = window.MyraSite?.wa || waNum(c?.shop?.whatsapp || c?.company?.phone) || WA_DEFAULT;
    const waLink = t => `https://wa.me/${wa}?text=${encodeURIComponent(t)}`;
    const K = kind === 'avis' ? {
      ico: 'fa-star', title: reason ? 'Lien d’avis indisponible' : 'Votre avis compte',
      text: reason || 'Après chaque livraison, nous vous envoyons sur WhatsApp un lien pour noter votre commande en 10 secondes.',
      points: [['fa-star', 'Notez de 1 à 5 étoiles'], ['fa-comment', 'Ajoutez un commentaire si vous le souhaitez'], ['fa-heart', 'Vous nous aidez à mieux vous servir']],
      main: ['Donner mon avis sur WhatsApp', 'Bonjour Les saveurs de Myra, voici mon avis sur ma commande : ']
    } : {
      ico: 'fa-user-lock', title: reason ? 'Lien expiré ou désactivé' : 'Votre espace client',
      text: reason || 'Cet espace est personnel : il s’ouvre uniquement avec le lien que nous vous envoyons sur WhatsApp.',
      points: [['fa-file-invoice', 'Vos factures et leur détail'], ['fa-hand-holding-dollar', 'Ce qu’il vous reste à payer'], ['fa-gift', 'Vos points fidélité']],
      main: ['Recevoir mon lien sur WhatsApp', 'Bonjour Les saveurs de Myra, pouvez-vous m’envoyer le lien de mon espace client ? Mon nom : ']
    };
    return `<section class="pub-card pub-center landing"><span class="land-ico"><i class="fa-solid ${K.ico}" aria-hidden="true"></i></span><h1>${esc(K.title)}</h1><p>${esc(K.text)}</p>
      <ul class="land-list">${K.points.map(([i, t]) => `<li><i class="fa-solid ${i}" aria-hidden="true"></i>${esc(t)}</li>`).join('')}</ul>
      <div class="land-actions"><a class="btn btn-wa full" href="${esc(waLink(K.main[1]))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> ${esc(K.main[0])}</a>
      <a class="btn btn-ghost full" href="commande.html"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Suivre une commande</a>
      <a class="btn btn-green full" href="boutique.html"><i class="fa-solid fa-store" aria-hidden="true"></i> Voir la boutique</a></div></section>`;
  };

  let cached = null; try { cached = JSON.parse(localStorage.getItem('myra_shop_catalog') || 'null'); } catch (_) {}
  if (cached) apply(cached);
  const cfg = window.MYRA_CONFIG || {};
  if (window.supabase && cfg.SUPABASE_URL) {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    sb.rpc('get_public_catalog').then(({ data }) => { if (data) { try { localStorage.setItem('myra_shop_catalog', JSON.stringify(data)); } catch (_) {} apply(data); } });
  }
})();
