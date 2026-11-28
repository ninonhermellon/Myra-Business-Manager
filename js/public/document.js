/* Document partagé (document.html?t=…) : reçu, facture, bon de commande, devis… envoyé par WhatsApp, SMS ou e-mail.
   Une seule fonction sécurisée : get_shared_document. Le document est affiché sans aucun script (cadre isolé). */
(() => {
  const $ = s => document.querySelector(s);
  const cfg = window.MYRA_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = new URLSearchParams(location.search).get('t') || '';
  const state = $('#docState'), frame = $('#docFrame');
  const fail = m => { state.innerHTML = `<span class="ill"><i class="fa-solid fa-file-circle-xmark" aria-hidden="true"></i></span><h2>Document indisponible</h2><p>${m}</p><a class="btn btn-green" href="boutique.html">Visiter la boutique</a>`; state.classList.add('doc-missing'); };
  if (!/^[0-9a-f]{64}$/.test(token)) return fail('Ce lien est incomplet. Demandez à Les saveurs de Myra de vous le renvoyer.');
  (async () => {
    const { data, error } = await sb.rpc('get_shared_document', { p_token: token });
    if (error || !data) return fail(/expir/i.test(error?.message || '') ? 'Ce lien a expiré (90 jours). Demandez un nouveau lien.' : 'Ce document est introuvable ou a expiré.');
    document.title = `${data.title} · Les saveurs de Myra`;
    $('#docTitle').textContent = data.title; $('#docBar').hidden = false; state.hidden = true;
    frame.hidden = false; frame.srcdoc = data.html;
    const fit = () => { try { frame.style.height = (frame.contentDocument.documentElement.scrollHeight + 8) + 'px'; } catch (_) {} };
    frame.addEventListener('load', () => { fit(); setTimeout(fit, 400); });
    window.addEventListener('resize', fit);
    $('#docPrint').onclick = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) { window.print(); } };
    if (navigator.share) { const b = $('#docShare'); b.hidden = false; b.onclick = () => navigator.share({ title: data.title, url: location.href }).catch(() => {}); }
  })();
})();
