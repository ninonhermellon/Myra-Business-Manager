/* LSM Business Manager V39 — Validation en deux étapes (code à 6 chiffres d'une application d'authentification :
   Google Authenticator, Microsoft Authenticator…). Le serveur refuse tout accès aux données tant que le code n'a pas été saisi. */
(() => {
  const X = window.MyraX, { A, esc } = X;
  const sb = () => A()?.sb;

  window.MyraMFA = {
    async needsCode() {
      const { data, error } = await sb().auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) return false;
      return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
    },
    ask(done) {
      const app = A(); document.querySelector('.splash')?.classList.add('hidden'); document.getElementById('splash')?.classList.add('hidden');
      document.getElementById('appView')?.classList.add('hidden'); document.getElementById('authView')?.classList.remove('hidden');
      const login = document.getElementById('loginForm'); login?.classList.add('hidden');
      let box = document.getElementById('mfaBox');
      if (!box) { box = document.createElement('form'); box.id = 'mfaBox'; box.className = 'stack mfa-box'; login?.insertAdjacentElement('afterend', box) || document.getElementById('authView').appendChild(box); }
      box.classList.remove('hidden');
      box.innerHTML = `<p class="mfa-ico"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></p><h2>Validation en deux étapes</h2>
        <p class="muted">Ouvrez votre application d’authentification et saisissez le code à 6 chiffres affiché pour « LSM Business Manager ».</p>
        <label for="mfaCode">Code de sécurité<input id="mfaCode" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="123456"></label>
        <button class="btn primary full" type="submit"><i class="fa-solid fa-unlock" aria-hidden="true"></i> Valider</button>
        <button class="btn light full" type="button" id="mfaOut">Changer de compte</button><p class="auth-message" id="mfaMsg" role="status"></p>`;
      box.querySelector('#mfaCode').focus();
      box.querySelector('#mfaOut').onclick = async () => { await sb().auth.signOut().catch(() => {}); box.classList.add('hidden'); login?.classList.remove('hidden'); app.showAuth?.('Vous êtes déconnecté.'); };
      box.onsubmit = async e => {
        e.preventDefault(); const code = box.elements.code.value.trim(); const msg = box.querySelector('#mfaMsg'); const b = box.querySelector('[type=submit]'); b.disabled = true;
        try {
          const { data: f } = await sb().auth.mfa.listFactors(); const factor = (f?.totp || []).find(x => x.status === 'verified');
          if (!factor) throw new Error('Aucune application d’authentification enregistrée.');
          const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
          if (error) throw error;
          box.classList.add('hidden'); login?.classList.remove('hidden'); done();
        } catch (err) { msg.textContent = /invalid|expired|code/i.test(err.message || '') ? 'Code incorrect ou expiré. Réessayez avec le nouveau code.' : (err.message || 'Validation impossible.'); msg.style.color = '#D11A05'; box.elements.code.select(); }
        finally { b.disabled = false; }
      };
    }
  };

  /* Carte « Validation en deux étapes » dans Mon profil */
  X.on('profile', async host => {
    const app = A(); if (!host || !navigator.onLine) return;
    const card = document.createElement('section'); card.className = 'card mfa-card'; card.id = 'pfMfa';
    host.appendChild(card);
    const draw = async () => {
      const { data } = await sb().auth.mfa.listFactors(); const on = (data?.totp || []).find(x => x.status === 'verified');
      const boss = ['owner', 'admin'].includes(app.state.profile?.role);
      card.innerHTML = `<div class="card-head"><h3><i class="fa-solid fa-shield-halved"></i> Validation en deux étapes</h3><span class="tm-state ${on ? 'on' : 'off'}">${on ? 'Activée' : 'Désactivée'}</span></div>
        <p class="muted">${on ? 'À chaque nouvelle connexion, un code à 6 chiffres de votre application d’authentification vous est demandé. Même avec votre mot de passe, personne ne peut entrer sans votre téléphone.' : 'Protégez votre compte : en plus du mot de passe, un code à 6 chiffres (Google Authenticator, Microsoft Authenticator…) sera demandé à chaque nouvelle connexion.' + (boss ? ' <b>Fortement recommandé pour le compte propriétaire.</b>' : '')}</p>
        <div class="actions">${on ? '<button type="button" class="btn light" id="mfaOff"><i class="fa-solid fa-lock-open"></i> Désactiver</button>' : '<button type="button" class="btn primary" id="mfaOn"><i class="fa-solid fa-shield-halved"></i> Activer</button>'}</div>`;
      card.querySelector('#mfaOn')?.addEventListener('click', enroll);
      card.querySelector('#mfaOff')?.addEventListener('click', async () => {
        if (!confirm('Désactiver la validation en deux étapes ? Votre compte sera protégé par le mot de passe seul.')) return;
        const { error } = await sb().auth.mfa.unenroll({ factorId: on.id }); if (error) return app.toast(error.message, true);
        await sb().auth.refreshSession().catch(() => {}); app.toast('Validation en deux étapes désactivée.'); draw();
      });
    };
    async function enroll() {
      const { data: old } = await sb().auth.mfa.listFactors();
      for (const f of (old?.all || []).filter(x => x.status !== 'verified')) await sb().auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
      const { data, error } = await sb().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'LSM Business Manager', issuer: 'LSM Business Manager' });
      if (error) return app.toast(error.message, true);
      const m = X.modal('Activer la validation en deux étapes', `<ol class="mfa-steps"><li>Installez <b>Google Authenticator</b> ou <b>Microsoft Authenticator</b> sur votre téléphone.</li><li>Dans l’application, touchez « + » puis <b>scannez ce QR code</b> :</li></ol>
        <div class="mfa-qr"><img src="${esc(data.totp.qr_code)}" alt="QR code à scanner"></div><p class="muted small">Impossible de scanner ? Saisissez cette clé : <code class="mfa-secret">${esc(data.totp.secret)}</code></p>
        <label class="field">3. Code à 6 chiffres affiché<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>`, '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Activer</button>', { form: true });
      m.el.onsubmit = async e => {
        e.preventDefault(); const { error: er } = await sb().auth.mfa.challengeAndVerify({ factorId: data.id, code: m.el.elements.code.value.trim() });
        if (er) return app.toast('Code incorrect : vérifiez l’heure de votre téléphone et réessayez.', true);
        m.close(); app.toast('Validation en deux étapes activée ✔'); draw();
      };
    }
    draw();
  });
})();
