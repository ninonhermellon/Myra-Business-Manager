/* Myra — Gabarit unique de tous les documents imprimables (facture, devis, reçu, bons, fiches, listes, rapports…).
   Style minimaliste : illustration centrée, titre, cartes arrondies, lignes libellé / valeur, pilule sombre, état en couleur.
   Les documents ne fournissent que des données ; la mise en page est définie ici et nulle part ailleurs.

   MyraDoc.write(fenêtre, d)  — écrit le document dans une fenêtre / un cadre et branche les boutons (sans script en ligne).
   MyraDoc.html(d)            — renvoie le HTML complet.

   d = { company:{name,phone,email,address,currency}, title, kicker, subtitle, number, date,
         status:[libellé, ton], statusText, items:[{name,unit,qty,price,total,meta,image}], itemsTitle,
         parties:[{label,main,lines}], blocks:[[libellé,valeur]], infoTitle,
         totals:[[libellé,valeurFormatée]], grand:[libellé,valeurFormatée], rest:[libellé,valeur,ton], amountsTitle,
         sections:[{title, rows:[[libellé,valeur,{raw,strong}]], text, html, table:{head:[], rows:[[]], align:[]}}],
         notice:[titre,texte], words, signatures:[libellés] | signLabel, pill, wide, hero (HTML), extraCss, autoprint }
   ton : ok | warn | due | bad | info */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, cur = 'FCFA') => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(Number(n || 0))) + ' ' + cur;
  const qty = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(Number(n || 0));
  const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const fdate = v => { const d = v ? new Date(v) : new Date(); return isNaN(d) ? String(v) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const asset = p => { try { return new URL(p, window.location.href).href; } catch (_) { return p; } };
  const TONES = { ok: '#2f9e4f', info: '#2f9e4f', warn: '#b7791f', due: '#c0392b', bad: '#c0392b' };

  const CSS = `*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#f3f4f3;color:#1b1e1c;font:14px/1.5 'Inter','DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.bar{position:sticky;top:0;z-index:2;display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;background:rgba(243,244,243,.92);backdrop-filter:blur(8px)}
.bar button{font:500 13.5px inherit;font-family:inherit;border:1px solid #dcdfdc;background:#fff;color:#1b1e1c;border-radius:999px;padding:9px 18px;cursor:pointer}
.bar button.dark{background:#171a18;border-color:#171a18;color:#fff}
.paper{max-width:620px;margin:6px auto 40px;background:#fff;border:1px solid #e4e6e4;border-radius:40px;padding:52px 40px 40px}
.wide .paper{max-width:1000px}
.hero{text-align:center}
.ill{width:108px;height:108px;margin:0 auto 22px;border-radius:50%;background:#d9f0e0;display:grid;place-items:center}
.ill img{width:84px;height:84px;border-radius:50%;object-fit:cover;display:block}
h1{margin:0;font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1.2}
.sub{margin:6px 0 0;color:#6b706d;font-size:16px}
.org{margin:4px 0 0;color:#9a9f9c;font-size:12.5px}
.card{margin-top:22px;border:1px solid #ececec;border-radius:18px;background:#fff;overflow:hidden}
.card.soft{background:#fbfbfb}
.card-h{padding:16px 20px;border-bottom:1px solid #ececec;font-weight:600;font-size:14.5px;background:#fff}
.rows{padding:8px 0}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:18px;padding:8px 20px;font-size:13.5px}
.row>span{color:#7b807d;flex:none;max-width:48%}
.row>b{font-weight:500;text-align:right;min-width:0;overflow-wrap:anywhere}
.row>b small{display:block;color:#8d928f;font-weight:400;font-size:12px;margin-top:1px}
.row.stack{display:block}.row.stack>span{display:block;max-width:none;margin-bottom:2px}.row.stack>b{display:block;text-align:left;font-weight:400;color:#3b403d;white-space:pre-line}
.row.strong>b{font-weight:700;font-size:15px}.row.strong>span{color:#1b1e1c;font-weight:600}
.row.sep{border-top:1px solid #ececec;margin-top:6px;padding-top:12px}
.row.ok>b{color:#2f9e4f}.row.warn>b,.row.due>b{color:#c0392b}
.item{display:flex;gap:16px;align-items:center;padding:16px 20px}
.item+.item{border-top:1px solid #f1f1f1}
.thumb{flex:none;width:52px;height:52px;border-radius:13px;background:linear-gradient(180deg,#f6f6f6,#e9e9e9);display:grid;place-items:center;font-weight:600;font-size:15px;color:#5d625f;overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:cover}
.it{flex:1;min-width:0}.it small{display:block;color:#7b807d;font-size:12.5px}.it b{display:block;font-weight:500;font-size:15px;margin:1px 0}.it em{font-style:normal;color:#5d625f;font-size:12.5px}
.amt{font-weight:600;white-space:nowrap}.pm{display:none}
.empty{padding:18px 20px;color:#8d928f}
table{width:100%;border-collapse:collapse;font-size:13px}
th{color:#7b807d;font-weight:500;text-align:left;padding:11px 14px;border-bottom:1px solid #ececec;background:#fbfbfb;white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid #f2f2f2;vertical-align:top}
tr:last-child td{border-bottom:0}
th:first-child,td:first-child{padding-left:20px}th:last-child,td:last-child{padding-right:20px}
.r{text-align:right}.c{text-align:center}
tfoot td{font-weight:600;border-top:1px solid #ececec;background:#fbfbfb}
.text{padding:14px 20px;color:#3b403d;white-space:pre-line}
.html{padding:14px 20px}
.sign{display:flex;gap:28px;margin-top:30px}
.sign div{flex:1;margin-top:46px;border-top:1px dashed #cfd3d0;padding-top:7px;text-align:center;color:#8d928f;font-size:11.5px}
.pill{display:block;width:fit-content;min-width:260px;max-width:100%;margin:34px auto 0;padding:14px 30px;border-radius:999px;background:#171a18;color:#fff;text-align:center;font-weight:500;font-size:14.5px}
.state{text-align:center;margin:12px 0 0;font-size:12.5px}
.words{text-align:center;color:#8d928f;font-size:11.5px;margin:10px 0 0}
.notice{margin:18px auto 0;max-width:460px;text-align:center;color:#8d928f;font-size:11.5px}
.notice b{display:block;color:#5d625f;font-weight:600;letter-spacing:.04em;font-size:10.5px;margin-bottom:2px}
.foot{margin-top:26px;text-align:center;color:#a0a5a2;font-size:11px;line-height:1.7}
@media (max-width:560px){.paper{margin:0 8px 24px;border-radius:28px;padding:36px 18px 28px}h1{font-size:24px}.row>span{max-width:55%}.item{padding:14px 16px}.thumb{width:46px;height:46px}.sign{flex-direction:column;gap:0}}
@media print{body{background:#fff}.bar{display:none}.paper{border:0;border-radius:0;margin:0 auto;padding:0;max-width:640px}.wide .paper{max-width:none}
.card-h{padding:9px 16px;font-size:13px}.rows{padding:4px 0}.row{padding:4px 16px;font-size:12px}.row.sep{padding-top:7px;margin-top:3px}
.ill{width:62px;height:62px;margin-bottom:8px}.ill img{width:50px;height:50px}h1{font-size:22px}.sub{font-size:13px;margin-top:2px}.org{font-size:11px}
.card{margin-top:12px;border-radius:14px}.item{padding:8px 16px;gap:12px}.thumb{width:34px;height:34px;border-radius:9px;font-size:12px}.it b{font-size:13px;margin:0}.it small{display:none}.it em{font-size:11px}.pm{display:inline}.item{padding:6px 16px}
th,td{padding:6px 12px;font-size:11.5px}.text,.html{padding:9px 16px}.sign div{margin-top:30px}
.pill{margin-top:14px;padding:8px 24px;font-size:13px}.state{margin-top:5px}.words{margin-top:4px}.notice{margin-top:8px}.foot{margin-top:10px;line-height:1.5;break-inside:avoid}
.card-h,.card,.item,.row,tr,.sign,.pill{break-inside:avoid}.card-h{break-after:avoid}@page{size:A4;margin:12mm}}`;

  function rowsHtml(rows) {
    return (rows || []).filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v, o = {}]) => {
      const val = o.raw ? String(v) : esc(v);
      const long = !o.raw && String(v).length > 70;
      return `<div class="row${long ? ' stack' : ''}${o.strong ? ' strong' : ''}${o.sep ? ' sep' : ''}${o.tone ? ' ' + o.tone : ''}"><span>${esc(k)}</span><b>${val}${o.small ? `<small>${esc(o.small)}</small>` : ''}</b></div>`;
    }).join('');
  }
  const card = (title, inner, soft) => inner ? `<section class="card${soft ? ' soft' : ''}">${title ? `<div class="card-h">${esc(title)}</div>` : ''}${inner}</section>` : '';

  function html(d) {
    const c = d.company || {}, cur = c.currency || 'FCFA', name = c.name || 'Les Saveurs de Myra';
    const contact = [...new Set([c.address && !/@/.test(c.address) ? c.address : '', c.phone ? 'Tél. ' + c.phone : '', c.email].filter(Boolean))];
    const subtitle = d.subtitle ?? [d.number ? 'N° ' + d.number : '', d.date ? fdate(d.date) : ''].filter(Boolean).join(' · ');
    const hero = d.hero ?? `<div class="ill"><img src="${esc(asset('assets/logo-les-saveurs-de-myra.png'))}" alt="${esc(name)}"></div>`;

    const items = d.items ? ((d.items.length ? d.items.map(i => `<div class="item"><div class="thumb">${i.image ? `<img src="${esc(i.image)}" alt="">` : esc(initials(i.name))}</div><div class="it">${i.meta || i.unit ? `<small>${esc(i.meta || i.unit)}</small>` : ''}<b>${esc(i.name)}</b>${i.qty != null ? `<em>${i.meta || i.unit ? `<span class="pm">${esc(i.meta || i.unit)} · </span>` : ''}${qty(i.qty)} × ${fmt(i.price, cur)}</em>` : ''}</div><div class="amt">${i.total != null ? fmt(i.total, cur) : ''}</div></div>`).join('') : '<div class="empty">Aucun article.</div>')) : '';

    const info = [];
    (d.parties || []).forEach(p => { const lines = (p.lines || []).filter(Boolean); info.push([p.label, p.main || '—', { small: lines.join(' · ') || undefined }]); });
    (d.blocks || []).forEach(b => b && b[1] && info.push([b[0], b[1]]));

    const money = [...(d.totals || []).map(t => [t[0], t[1], { raw: true }])];
    if (d.grand) money.push([d.grand[0], d.grand[1], { raw: true, strong: true, sep: true }]);
    if (d.rest) money.push([d.rest[0], d.rest[1], { raw: true, tone: d.rest[2] === 'ok' ? 'ok' : 'due' }]);

    const sections = (d.sections || []).map(s => {
      let inner = '';
      if (s.rows) inner = `<div class="rows">${rowsHtml(s.rows)}</div>`;
      else if (s.table) { const al = s.table.align || []; inner = `<div style="overflow-x:auto"><table><thead><tr>${s.table.head.map((h, i) => `<th class="${al[i] || ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.length ? s.table.rows.map(r => `<tr>${r.map((v, i) => `<td class="${al[i] || ''}">${s.table.raw ? v : esc(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${s.table.head.length}" class="empty">${esc(s.table.empty || 'Aucune donnée.')}</td></tr>`}</tbody>${s.table.foot ? `<tfoot><tr>${s.table.foot.map((v, i) => `<td class="${al[i] || ''}">${esc(v)}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`; }
      else if (s.text) inner = `<div class="text">${esc(s.text)}</div>`;
      else if (s.html) inner = `<div class="html">${s.html}</div>`;
      return card(s.title, inner, s.soft);
    }).join('');

    const signs = d.signatures || (d.signLabel ? [d.signLabel] : []);
    const pill = d.pill ?? (d.grand ? `${d.grand[0]} · ${d.grand[1]}` : '');
    const tone = d.status ? TONES[d.status[1]] || TONES.ok : TONES.ok;
    const stateTxt = d.statusText || (d.status ? d.status[0] : '');

    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title || d.kicker || name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}${d.wide ? '@media print{@page{size:A4 landscape;margin:12mm}}' : ''}${d.extraCss || ''}</style></head>
<body class="${d.wide ? 'wide' : ''}"><div class="bar"><button type="button" id="mdClose">Fermer</button><button type="button" class="dark" id="mdPrint">Imprimer / PDF</button></div>
<main class="paper"><header class="hero">${hero}<h1>${esc(d.kicker || d.title || '')}</h1>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}<p class="org">${esc(name)}</p></header>
${d.items ? card(d.itemsTitle || '', items) : ''}
${info.length ? card(d.infoTitle || 'Récapitulatif', `<div class="rows">${rowsHtml(info)}</div>`, true) : ''}
${money.length ? card(d.amountsTitle || 'Montants', `<div class="rows">${rowsHtml(money)}</div>`) : ''}
${sections}
${signs.length ? `<div class="sign">${signs.map(s => `<div>${esc(s)}</div>`).join('')}</div>` : ''}
${pill ? `<div class="pill">${esc(pill)}</div>` : ''}${stateTxt ? `<p class="state" style="color:${tone}">${esc(stateTxt)}</p>` : ''}
${d.words ? `<p class="words">${esc(d.words)}</p>` : ''}
${d.notice ? `<p class="notice"><b>${esc(d.notice[0])}</b>${esc(d.notice[1])}</p>` : ''}
<footer class="foot">${esc(name)}${contact.length ? '<br>' + contact.map(esc).join(' · ') : ''}<br>Merci pour votre confiance.</footer></main></body></html>`;
  }

  function write(win, d) {
    if (!win) return;
    const doc = win.document; doc.open(); doc.write(html(d)); doc.close();
    const close = () => { if (win.__myraPrintFrame) win.__myraPrintFrame.remove(); else win.close(); };
    doc.getElementById('mdPrint').addEventListener('click', () => { win.focus(); win.print(); });
    doc.getElementById('mdClose').addEventListener('click', close);
    doc.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    if (d.autoprint) setTimeout(() => { win.focus(); win.print(); }, 600);
  }

  window.MyraDoc = { html, write, fmt, fdate };
})();
