/* Espace client public : lecture seule, via la fonction sécurisée get_customer_portal et le jeton du lien. */
(() => {
  const app = document.getElementById('app');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, cur = 'FCFA') => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n || 0)) + ' ' + cur;
  const fdate = v => v ? new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const STATUS = { confirmed: ['À payer', 'warn'], partially_paid: ['Partiellement payée', 'warn'], paid: ['Payée', 'ok'] };
  const fail = msg => { app.innerHTML = `<section class="pub-card pub-center"><i class="fa-solid fa-link-slash pub-big-ico" aria-hidden="true"></i><h1>Lien indisponible</h1><p>${esc(msg)}</p><p class="muted">Demandez un nouveau lien aux Saveurs de Myra.</p></section>`; };
  const token = new URLSearchParams(location.search).get('t') || '';
  if (token.length < 40) return fail('Ce lien est incomplet.');
  const cfg = window.MYRA_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  sb.rpc('get_customer_portal', { p_token: token }).then(({ data, error }) => {
    if (error || !data) return fail(/expir|invalide/i.test(error?.message || '') ? 'Ce lien a expiré ou a été désactivé.' : 'Impossible de charger votre espace pour le moment. Réessayez dans un instant.');
    const c = data.company || {}, cur = c.currency || 'FCFA', sales = data.sales || [];
    const waNum = (() => { let d = String(c.phone || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); else if (!d.startsWith('242') && (d.startsWith('0') || d.length <= 9)) d = '242' + d; return d; })();
    const wa = waNum ? 'https://wa.me/' + waNum : '';
    app.innerHTML = `
      <header class="pub-head">${c.logo ? `<img src="${esc(c.logo)}" alt="" class="pub-logo">` : '<img src="assets/logo-les-saveurs-de-myra.png" alt="" class="pub-logo">'}<div><small>${esc(c.name || 'Les Saveurs de Myra')}</small><h1>Bonjour ${esc((data.customer?.name || '').split(' ')[0])} 👋</h1></div></header>
      <section class="pub-kpis">
        <div class="pub-kpi ${Number(data.outstanding) > 0 ? 'warn' : 'ok'}"><small>Reste à payer</small><b>${money(data.outstanding, cur)}</b></div>
        <div class="pub-kpi"><small>Points fidélité</small><b>${Number(data.points || 0)}</b></div>
        <div class="pub-kpi"><small>Achats</small><b>${sales.length}</b></div>
      </section>
      <h2 class="pub-h2">Mes factures</h2>
      ${sales.length ? sales.map((s, i) => { const st = STATUS[s.status] || ['', '']; const due = Number(s.total) - Number(s.paid); return `<article class="pub-card pub-sale"><button type="button" class="pub-sale-head" data-i="${i}" aria-expanded="false"><span><b>${esc(s.number)}</b><small>${fdate(s.date)}</small></span><span class="pub-right"><b>${money(s.total, cur)}</b><span class="pub-tone ${st[1]}">${esc(st[0])}${due > 0 && s.status !== 'paid' ? ' · reste ' + money(due, cur) : ''}</span></span></button><div class="pub-sale-body" hidden><table><thead><tr><th>Article</th><th class="r">Qté</th><th class="r">Montant</th></tr></thead><tbody>${(s.items || []).map(it => `<tr><td>${esc(it.name)}${it.unit ? ` <small>(${esc(it.unit)})</small>` : ''}</td><td class="r">${Number(it.quantity)}</td><td class="r">${money(it.total, cur)}</td></tr>`).join('')}${Number(s.discount) ? `<tr><td colspan="2">Remise</td><td class="r">− ${money(s.discount, cur)}</td></tr>` : ''}${Number(s.shipping) ? `<tr><td colspan="2">Livraison</td><td class="r">${money(s.shipping, cur)}</td></tr>` : ''}<tr class="tot"><td colspan="2">Total</td><td class="r">${money(s.total, cur)}</td></tr><tr><td colspan="2">Déjà payé</td><td class="r">${money(s.paid, cur)}</td></tr></tbody></table><button type="button" class="pub-btn light" data-print="${i}"><i class="fa-solid fa-file-arrow-down"></i> Télécharger la facture (PDF)</button></div></article>`; }).join('') : '<p class="muted">Aucun achat pour le moment.</p>'}
      <footer class="pub-foot">${wa ? `<a class="pub-btn" href="${esc(wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Nous écrire sur WhatsApp</a>` : ''}<p class="muted">${esc([c.address, c.phone, c.email].filter(Boolean).join(' · '))}</p><p class="muted small">Lien personnel : ne le partagez pas.</p></footer>`;
    app.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const body = b.nextElementSibling; body.hidden = !body.hidden; b.setAttribute('aria-expanded', String(!body.hidden)); });
    app.querySelectorAll('[data-print]').forEach(b => b.onclick = () => {
      const s = sales[Number(b.dataset.print)];
      const w = window.open('', '_blank'); if (!w) return;
      w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${esc(s.number)}</title><style>body{font:13px/1.5 Arial,sans-serif;color:#14231a;margin:24px}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #e3e9e4;text-align:left}.r{text-align:right}.tot td{font-weight:700}button{margin-top:18px;padding:10px 16px;border:0;border-radius:10px;background:#0d4426;color:#fff;font-weight:700}@media print{button{display:none}}</style></head><body><h1>${esc(c.name || 'Les Saveurs de Myra')}</h1><div>${esc([c.address, c.phone].filter(Boolean).join(' · '))}</div><h2>Facture ${esc(s.number)}</h2><div>Date : ${fdate(s.date)} · Client : ${esc(data.customer?.name || '')}</div><table><thead><tr><th>Article</th><th class="r">Qté</th><th class="r">Prix</th><th class="r">Montant</th></tr></thead><tbody>${(s.items || []).map(it => `<tr><td>${esc(it.name)}</td><td class="r">${Number(it.quantity)}</td><td class="r">${money(it.price, cur)}</td><td class="r">${money(it.total, cur)}</td></tr>`).join('')}${Number(s.discount) ? `<tr><td colspan="3">Remise</td><td class="r">− ${money(s.discount, cur)}</td></tr>` : ''}${Number(s.shipping) ? `<tr><td colspan="3">Livraison</td><td class="r">${money(s.shipping, cur)}</td></tr>` : ''}<tr class="tot"><td colspan="3">Total</td><td class="r">${money(s.total, cur)}</td></tr><tr><td colspan="3">Déjà payé</td><td class="r">${money(s.paid, cur)}</td></tr><tr class="tot"><td colspan="3">Reste à payer</td><td class="r">${money(Math.max(0, s.total - s.paid), cur)}</td></tr></tbody></table><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></body></html>`);
      w.document.close();
    });
  });
})();
