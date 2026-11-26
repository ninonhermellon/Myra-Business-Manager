/* Avis clients : critères, saisie par étoiles, résumé et liste — partagé par la boutique et avis.html */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CRITERIA = [
    ['product', 'Le produit', 'Goût, qualité, fraîcheur', true],
    ['shop', 'La boutique', 'Commande en ligne, choix, clarté des prix'],
    ['service', 'Le service', 'Accueil, conseils, rapidité de réponse'],
    ['delivery', 'La livraison', 'Délai, ponctualité, état de la commande'],
    ['after_sales', 'Le SAV', 'Suivi après l’achat, réponse aux réclamations']
  ];
  const WORDS = ['', 'Décevant', 'Moyen', 'Bien', 'Très bien', 'Excellent'];
  const SHORT = { product: 'Produit', shop: 'Boutique', service: 'Service', delivery: 'Livraison', after_sales: 'SAV' };
  const stars = (r, cls = '') => { const n = Math.round(Number(r) || 0); return `<span class="rv-stars ${cls}" aria-label="${Number(r || 0).toFixed(1)} sur 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`; };

  // Ligne de saisie : 5 étoiles (+ « Non concerné » pour les critères facultatifs)
  const starInput = ([k, label, hint, required]) => `<div class="rv-crit" data-crit="${k}">
      <div class="rv-crit-t"><b>${esc(label)}${required ? ' *' : ''}</b><small>${esc(hint)}</small></div>
      <div class="rv-pick" role="radiogroup" aria-label="${esc(label)}">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="false" data-n="${n}" aria-label="${n} étoile${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
      <span class="rv-word">${required ? 'Touchez une étoile' : 'Non concerné'}</span></div>`;
  function bind(root) {
    const values = {};
    root.querySelectorAll('.rv-crit').forEach(row => {
      const k = row.dataset.crit, btns = [...row.querySelectorAll('[data-n]')], word = row.querySelector('.rv-word');
      const set = n => { values[k] = n || undefined; btns.forEach(b => { const on = Number(b.dataset.n) <= n; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(Number(b.dataset.n) === n)); }); word.textContent = n ? WORDS[n] : (CRITERIA.find(c => c[0] === k)[3] ? 'Touchez une étoile' : 'Non concerné'); };
      btns.forEach(b => b.onclick = () => set(values[k] === Number(b.dataset.n) && !CRITERIA.find(c => c[0] === k)[3] ? 0 : Number(b.dataset.n)));
    });
    return () => Object.fromEntries(Object.entries(values).filter(([, v]) => v));
  }

  function summary(s, total) {
    if (!s || !s.count) return '<div class="rv-empty"><b>Pas encore d’avis</b><span>Soyez la première personne à donner votre avis !</span></div>';
    const bars = [5, 4, 3, 2, 1].map(n => { const c = Number(s.stars?.[n] || 0); return `<div class="rv-bar"><span>${n}★</span><i><b style="width:${s.count ? Math.round(c / s.count * 100) : 0}%"></b></i><em>${c}</em></div>`; }).join('');
    const crit = CRITERIA.filter(([k]) => s[k] != null).map(([k]) => `<div class="rv-c"><span>${SHORT[k]}</span>${stars(s[k], 'sm')}<b>${Number(s[k]).toFixed(1)}</b></div>`).join('');
    return `<div class="rv-sum"><div class="rv-big"><b>${Number(s.rating).toFixed(1)}</b>${stars(s.rating)}<small>${s.count} avis</small></div><div class="rv-bars">${bars}</div></div>${crit ? `<div class="rv-crits">${crit}</div>` : ''}`;
  }
  function list(reviews) {
    const fd = v => v ? new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    return (reviews || []).map(r => `<article class="rv-item"><header><span class="rv-av">${esc((r.author || '?').slice(0, 1).toUpperCase())}</span><span><b>${esc(r.author || 'Client')}</b>${r.verified ? '<em class="rv-ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Achat vérifié</em>' : ''}<small>${esc(fd(r.created_at))}</small></span>${stars(r.rating, 'sm')}</header>
      ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
      ${['shop', 'service', 'delivery', 'after_sales'].some(k => r[k]) ? `<div class="rv-tags">${CRITERIA.slice(1).filter(([k]) => r[k]).map(([k]) => `<span>${SHORT[k]} ${'★'.repeat(r[k])}</span>`).join('')}</div>` : ''}
      ${r.reply ? `<div class="rv-reply"><b>Réponse des Saveurs de Myra</b>${esc(r.reply)}</div>` : ''}</article>`).join('');
  }
  window.MyraAvis = { CRITERIA, SHORT, WORDS, stars, starInput, bind, summary, list, esc };
})();
