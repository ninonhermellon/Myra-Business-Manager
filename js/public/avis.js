/* Page publique de notation : une seule réponse par lien (fonctions sécurisées get_review_request / submit_review). */
(() => {
  const app = document.getElementById('app');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = new URLSearchParams(location.search).get('t') || '';
  const box = (ico, title, text) => `<section class="pub-card pub-center"><i class="fa-solid ${ico} pub-big-ico" aria-hidden="true"></i><h1>${title}</h1><p>${text}</p></section>`;
  if (token.length < 40) { app.innerHTML = box('fa-link-slash', 'Lien incomplet', 'Ouvrez le lien reçu sur WhatsApp en entier.'); return; }
  const cfg = window.MYRA_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const thanks = () => { app.innerHTML = box('fa-heart', 'Merci beaucoup !', 'Votre avis a bien été envoyé. Il nous aide à mieux vous servir.'); };

  sb.rpc('get_review_request', { p_token: token }).then(({ data, error }) => {
    if (error || !data) { app.innerHTML = box('fa-link-slash', 'Lien indisponible', 'Ce lien n’existe pas ou plus.'); return; }
    if (data.submitted) { app.innerHTML = box('fa-circle-check', 'Avis déjà envoyé', `Merci, vous avez déjà donné votre avis (${'★'.repeat(data.rating || 0)}).`); return; }
    let rating = 0;
    app.innerHTML = `<section class="pub-card"><header class="pub-head"><img src="assets/logo-les-saveurs-de-myra.png" alt="" class="pub-logo"><div><small>${esc(data.company || 'Les Saveurs de Myra')}</small><h1>${data.customer ? 'Bonjour ' + esc(data.customer) + ' !' : 'Bonjour !'}</h1></div></header>
      <p>Comment avez-vous trouvé votre commande <b>${esc(data.reference || '')}</b> ?</p>${(data.items || []).length ? `<p class="muted">${(data.items || []).map(esc).join(', ')}</p>` : ''}
      <div class="pub-stars" role="radiogroup" aria-label="Note de 1 à 5 étoiles">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="false" aria-label="${n} étoile${n > 1 ? 's' : ''}" data-n="${n}">★</button>`).join('')}</div>
      <p class="pub-star-label muted" id="starLabel">Touchez une étoile</p>
      <label class="pub-field">Un commentaire ? (facultatif)<textarea id="comment" maxlength="1000" rows="3" placeholder="Ce que vous avez aimé, ce que nous pouvons améliorer…"></textarea></label>
      <button type="button" class="pub-btn" id="send" disabled>Envoyer mon avis</button><p class="pub-err" id="err" role="alert"></p></section>`;
    const LABELS = ['', 'Pas satisfait', 'Peut mieux faire', 'Correct', 'Très bien', 'Excellent !'];
    app.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
      rating = Number(b.dataset.n);
      app.querySelectorAll('[data-n]').forEach(x => { const on = Number(x.dataset.n) <= rating; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(Number(x.dataset.n) === rating)); });
      app.querySelector('#starLabel').textContent = LABELS[rating]; app.querySelector('#send').disabled = false;
    });
    app.querySelector('#send').onclick = async e => {
      e.target.disabled = true; e.target.textContent = 'Envoi…';
      const { error: err } = await sb.rpc('submit_review', { p_token: token, p_rating: rating, p_comment: app.querySelector('#comment').value });
      if (err) { app.querySelector('#err').textContent = /déjà/.test(err.message) ? 'Vous avez déjà donné votre avis. Merci !' : 'Envoi impossible, réessayez.'; e.target.disabled = false; e.target.textContent = 'Envoyer mon avis'; return; }
      thanks();
    };
  });
})();
