/* Reçu en ligne (recu.html?t=…) : envoyé au client sur WhatsApp après son achat. Toujours à jour (paiements, retours).
   Une seule fonction sécurisée : get_public_receipt. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = window.MYRA_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let CUR = 'FCFA';
  const money = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n || 0)) + ' ' + CUR;
  const num = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n || 0));
  const fdt = v => v ? new Date(v).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const METHOD = { cash: 'Espèces', mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', bank_transfer: 'Virement', card: 'Carte', other: 'Autre' };
  const app = $('#rcApp'); const token = new URLSearchParams(location.search).get('t') || '';
  const fail = m => { app.innerHTML = `<div class="box center doc-missing"><span class="ill"><i class="fa-solid fa-receipt" aria-hidden="true"></i></span><h2>Reçu indisponible</h2><p>${esc(m)}</p><a class="btn btn-green" href="boutique.html">Visiter la boutique</a></div>`; };
  if (!/^[0-9a-f]{32}$/.test(token)) return fail('Ce lien est incomplet. Demandez à Les saveurs de Myra de vous le renvoyer.');
  (async () => {
    const { data: r, error } = await sb.rpc('get_public_receipt', { p_token: token });
    if (error || !r) return fail('Ce reçu est introuvable.');
    CUR = r.company?.currency || 'FCFA';
    const paid = Number(r.remaining) <= 0;
    app.innerHTML = `<div class="tr-hero ${paid ? '' : 'warn'}"><span class="ill"><i class="fa-solid ${paid ? 'fa-circle-check' : 'fa-hourglass-half'}" aria-hidden="true"></i></span>
        <h2>${paid ? 'Merci pour votre achat' : 'Reçu de votre achat'}${r.customer ? ', ' + esc(r.customer) : ''} !</h2><p>${paid ? 'Votre achat est entièrement réglé.' : 'Reste à payer : <b>' + money(r.remaining) + '</b>'}</p></div>
      <section class="box"><div class="box-h">Reçu ${esc(r.number)} <span class="muted">${esc(fdt(r.date))}</span></div>
        ${r.items.map(i => `<div class="kv"><span>${num(i.quantity)} × ${esc(i.name)}</span><b>${money(i.total)}</b></div>`).join('')}
        ${Number(r.discount) ? `<div class="kv ok"><span>Remise</span><b>− ${money(r.discount)}</b></div>` : ''}
        <div class="kv tot"><span>Total</span><b>${money(r.total)}</b></div>
        ${r.payments.map(p => `<div class="kv ok"><span>Payé · ${esc(METHOD[p.method] || p.method)} · ${esc(new Date(p.date).toLocaleDateString('fr-FR'))}</span><b>${money(p.amount)}</b></div>`).join('')}
        ${r.returns.map(x => `<div class="kv"><span>Retour ${esc(x.number)}</span><b>${Number(x.amount) ? 'remboursé ' + money(x.amount) : 'enregistré'}</b></div>`).join('')}
        ${Number(r.remaining) > 0 ? `<div class="kv tot bad"><span>Reste à payer</span><b>${money(r.remaining)}</b></div>` : ''}</section>
      <section class="box soft"><div class="box-h">${esc(r.company?.name || 'Les saveurs de Myra')}</div><p class="muted">${esc([r.company?.address, r.company?.phone].filter(Boolean).join(' · '))}</p></section>
      <div class="tr-actions"><button type="button" class="btn btn-green" id="rcPrint"><i class="fa-solid fa-print" aria-hidden="true"></i> Imprimer / PDF</button>${navigator.share ? '<button type="button" class="btn btn-line" id="rcShare"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Partager</button>' : ''}<a class="btn btn-ghost" href="boutique.html"><i class="fa-solid fa-store" aria-hidden="true"></i> Commander à nouveau</a></div>`;
    $('#rcPrint').onclick = () => window.print();
    $('#rcShare')?.addEventListener('click', () => navigator.share({ title: 'Reçu ' + r.number, url: location.href }).catch(() => {}));
  })();
})();
