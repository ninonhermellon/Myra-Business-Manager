/* LSM Business Manager V41 — Partager n'importe quel document (reçu, facture, bon de commande, devis, ticket de caisse, rapport…)
   par un lien sécurisé (valable 90 jours) : WhatsApp, SMS, e-mail, Telegram, Messenger, ou le menu « Partager » du téléphone. */
(() => {
  const A = () => window.MyraApp;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wa = p => { const d = String(p || '').replace(/\D/g, ''); if (!d) return ''; if (d.length === 9 && d.startsWith('0')) return '242' + d; if (d.length === 8) return '2420' + d; return d; };
  const base = () => location.origin + location.pathname.replace(/[^/]*$/, '');

  async function createLink(title, html, kind) {
    const { data, error } = await A().sb.rpc('share_document', { p_title: title, p_html: html, p_kind: kind || null });
    if (error) throw new Error(window.MyraX?.explain ? window.MyraX.explain(error) : error.message);
    return base() + 'document.html?t=' + data;
  }

  /* Panneau de partage, affiché DANS la fenêtre du document (au-dessus de tout) */
  function panel(doc, { title, url, phone, text }) {
    doc.getElementById('mdSharePanel')?.remove();
    const msg = (text ? text + '\n' : '') + `${title} — Les saveurs de Myra\n${url}`;
    const enc = encodeURIComponent(msg), phoneWa = wa(phone);
    const el = doc.createElement('div'); el.id = 'mdSharePanel';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Partager le document');
    el.innerHTML = `<style>
      #mdSharePanel{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(10,20,12,.45);font:14px/1.4 Inter,Arial,sans-serif}
      #mdSharePanel .sh{background:#fff;width:100%;max-width:460px;border-radius:22px 22px 0 0;padding:18px 18px 22px;box-shadow:0 -10px 40px rgba(0,0,0,.2)}
      @media(min-width:700px){#mdSharePanel{align-items:center}#mdSharePanel .sh{border-radius:22px}}
      #mdSharePanel h3{margin:0 0 4px;font-size:17px;color:#033B02}#mdSharePanel p{margin:0 0 12px;color:#5c6b61;font-size:13px}
      #mdSharePanel .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
      #mdSharePanel a,#mdSharePanel button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border:1px solid #e6ebe7;border-radius:14px;background:#fff;color:#1b2a1f;text-decoration:none;font:600 12.5px Inter,Arial,sans-serif;cursor:pointer}
      #mdSharePanel a:hover,#mdSharePanel button:hover{border-color:#348907;background:#f6fbf2}
      #mdSharePanel .ic{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:17px;font-weight:700}
      #mdSharePanel .link{display:flex;gap:6px}#mdSharePanel input{flex:1;min-width:0;padding:10px;border:1px solid #dfe6e1;border-radius:12px;font:13px Inter,Arial,sans-serif}
      #mdSharePanel .link button{flex-direction:row;padding:10px 14px;background:#033B02;color:#fff;border-color:#033B02}
      #mdSharePanel .close{margin-top:10px;width:100%;flex-direction:row;justify-content:center}
    </style><div class="sh"><h3>Partager « ${esc(title)} »</h3><p>Le destinataire ouvre le document sur son téléphone, sans application ni compte (lien valable 90 jours).</p>
      <div class="grid">
        ${navigator.share ? '<button type="button" data-native><span class="ic" style="background:#033B02">⇪</span>Autres applis</button>' : ''}
        <a target="_blank" rel="noopener" href="https://wa.me/${phoneWa}?text=${enc}"><span class="ic" style="background:#25D366">W</span>WhatsApp${phoneWa ? ' client' : ''}</a>
        ${phoneWa ? `<a target="_blank" rel="noopener" href="https://wa.me/?text=${enc}"><span class="ic" style="background:#128C7E">W</span>Autre contact</a>` : ''}
        <a href="sms:${phone ? esc(String(phone).replace(/\s/g, '')) : ''}?&body=${enc}"><span class="ic" style="background:#2c6a8f">✉</span>SMS</a>
        <a href="mailto:?subject=${encodeURIComponent(title + ' — Les saveurs de Myra')}&body=${enc}"><span class="ic" style="background:#DB820A">@</span>E-mail</a>
        <a target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}"><span class="ic" style="background:#229ED9">T</span>Telegram</a>
        <a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}"><span class="ic" style="background:#1877F2">f</span>Facebook</a>
      </div>
      <div class="link"><input readonly value="${esc(url)}" aria-label="Lien du document"><button type="button" data-copy>Copier</button></div>
      <button type="button" class="close" data-close>Fermer</button></div>`;
    doc.body.appendChild(el);
    el.querySelector('[data-close]').onclick = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    el.querySelector('[data-copy]').onclick = async e => { try { await navigator.clipboard.writeText(url); } catch (_) { const i = el.querySelector('input'); i.select(); doc.execCommand?.('copy'); } e.currentTarget.textContent = 'Copié ✔'; };
    el.querySelector('[data-native]')?.addEventListener('click', async () => { try { await navigator.share({ title, text: (text ? text + '\n' : '') + title, url }); } catch (_) {} });
  }

  window.MyraShare = {
    createLink,
    /* Depuis la fenêtre d'aperçu d'un document : copie propre (sans barre d'outils), lien, puis choix de l'application */
    async fromWindow(win, opts) {
      const doc = win.document; const btn = doc.getElementById('mdShare');
      if (btn) { btn.disabled = true; btn.textContent = 'Préparation…'; }
      try {
        const copy = doc.documentElement.cloneNode(true);
        copy.querySelectorAll('.bar, #mdSharePanel, script').forEach(n => n.remove());
        const url = await createLink(opts.title, '<!doctype html>' + copy.outerHTML, opts.kind);
        panel(doc, { ...opts, url });
      } catch (e) { (A()?.toast || alert)('Partage impossible : ' + (e.message || e), true); }
      finally { if (btn) { btn.disabled = false; btn.textContent = 'Partager'; } }
    },
    /* Partage d'un simple lien (reçu en ligne, suivi de commande…) */
    async link({ title, url, phone, text }) {
      const holder = document.createElement('div'); document.body.appendChild(holder);
      const fake = { getElementById: id => document.getElementById(id), createElement: t => document.createElement(t), body: document.body, execCommand: c => document.execCommand(c) };
      panel(fake, { title, url, phone, text });
      holder.remove();
    },
    receiptUrl: token => base() + 'recu.html?t=' + token
  };
})();
