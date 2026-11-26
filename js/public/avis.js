/* Page publique de notation : une seule réponse par lien (fonctions sécurisées get_review_request / submit_review). */
(() => {
  const app = document.getElementById('app');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = new URLSearchParams(location.search).get('t') || '';
  const box = (ico, title, text) => `<section class="pub-card pub-center"><i class="fa-solid ${ico} pub-big-ico" aria-hidden="true"></i><h1>${title}</h1><p>${text}</p></section>`;
  if (token.length < 40) { app.innerHTML = window.MyraLanding ? window.MyraLanding('avis') : box('fa-link-slash', 'Lien incomplet', 'Ouvrez le lien reçu sur WhatsApp en entier.'); return; }
  const cfg = window.MYRA_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const thanks = () => { app.innerHTML = box('fa-heart', 'Merci beaucoup !', 'Votre avis a bien été envoyé. Il nous aide à mieux vous servir.'); };

  sb.rpc('get_review_request', { p_token: token }).then(({ data, error }) => {
    if (error || !data) { app.innerHTML = window.MyraLanding ? window.MyraLanding('avis', 'Ce lien n’existe pas ou plus. Vous pouvez nous donner votre avis directement sur WhatsApp.') : box('fa-link-slash', 'Lien indisponible', 'Ce lien n’existe pas ou plus.'); return; }
    if (data.submitted) { app.innerHTML = box('fa-circle-check', 'Avis déjà envoyé', `Merci, vous avez déjà donné votre avis (${'★'.repeat(data.rating || 0)}).`); return; }
    app.innerHTML = `<section class="pub-card"><header class="pub-head"><img src="assets/logo-les-saveurs-de-myra.png" alt="" class="pub-logo"><div><small>${esc(data.company || 'Les Saveurs de Myra')}</small><h1>${data.customer ? 'Bonjour ' + esc(data.customer) + ' !' : 'Bonjour !'}</h1></div></header>
      <p>Comment avez-vous trouvé votre commande <b>${esc(data.reference || '')}</b> ?</p>${(data.items || []).length ? `<p class="muted">${(data.items || []).map(esc).join(', ')}</p>` : ''}
      <form id="rvForm" novalidate>${window.MyraAvis.CRITERIA.map(window.MyraAvis.starInput).join('')}
      <label class="pub-field">Un commentaire ? (facultatif)<textarea id="comment" maxlength="1000" rows="3" placeholder="Ce que vous avez aimé, ce que nous pouvons améliorer…"></textarea></label>
      <button type="submit" class="pub-btn" id="send">Envoyer mon avis</button><p class="pub-err" id="err" role="alert"></p></form></section>`;
    const get = window.MyraAvis.bind(app);
    app.querySelector('#rvForm').onsubmit = async e => {
      e.preventDefault(); const btn = app.querySelector('#send'); const d = get(); const errEl = app.querySelector('#err');
      if (!d.product) { errEl.textContent = 'Touchez une étoile pour noter le produit.'; return; }
      btn.disabled = true; btn.textContent = 'Envoi…';
      const { error: err } = await sb.rpc('submit_review', { p_token: token, p_rating: null, p_comment: app.querySelector('#comment').value, p_details: d });
      if (err) { errEl.textContent = /déjà/.test(err.message) ? 'Vous avez déjà donné votre avis. Merci !' : 'Envoi impossible, réessayez.'; btn.disabled = false; btn.textContent = 'Envoyer mon avis'; return; }
      thanks();
    };
  });
})();
