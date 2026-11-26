/* ==========================================================================
   Myra Business Manager — socle des modules V29
   Chargé AVANT js/app.js. Chaque module déclare ses tables (MyraExt.config),
   ses pages (MyraExt.pages), son menu (MyraExt.groups) et ses crochets
   (MyraExt.hooks). L'application les intègre au démarrage.
   ========================================================================== */
(() => {
  const EXT = window.MyraExt = window.MyraExt || {};
  ['config', 'pages', 'relations', 'labels', 'statusLabels', 'listViews'].forEach(k => { EXT[k] = EXT[k] || {}; });
  EXT.groups = EXT.groups || []; EXT.hooks = EXT.hooks || {}; EXT.moneyKeys = EXT.moneyKeys || [];

  const A = () => window.MyraApp;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n || 0)) + ' FCFA';
  const num = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n || 0));
  const fdate = v => v ? new Date(v).toLocaleDateString('fr-FR') : '—';
  const iso = d => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const today = () => iso(new Date());
  const monthStart = (d = new Date()) => iso(new Date(d.getFullYear(), d.getMonth(), 1));
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  function on(name, fn) { (EXT.hooks[name] = EXT.hooks[name] || []).push(fn); }
  function menu(label, items, index) { const g = EXT.groups.find(x => x.label === label); if (g) g.items.push(...items); else EXT.groups.push({ label, items: [...items], index }); }

  /* Lecture d'une table complète (pagination gérée par l'application). */
  /* Lecture complète d'une table sans colonne « id » (clé composée) : pagination sur les colonnes données. */
  async function loadKeyed(table, select, orderCols) {
    const app = A(); let rows = [];
    for (let from = 0; from < 50000; from += 1000) {
      let q = app.sb.from(table).select(select); orderCols.forEach(c => { q = q.order(c, { ascending: true }); });
      const { data, error } = await q.range(from, from + 999); if (error) throw new Error(error.message);
      rows = rows.concat(data || []); if (!data || data.length < 1000) break;
    }
    return rows;
  }
  async function load(table, select = '*', order = 'created_at', asc = false) {
    const app = A(); const { data, error } = await app.fetchAll(() => app.sb.from(table).select(select).order(order, { ascending: asc }));
    // Copie locale par table ET par liste de colonnes (une copie partielle ne doit jamais en remplacer une autre),
    // utilisée seulement hors connexion : en ligne, une erreur est affichée telle quelle.
    const key = 'ext:' + table + ':' + select;
    if (error) { const cached = !navigator.onLine && app.readOffline(key); if (cached) return cached; throw new Error(error.message); }
    app.writeOffline(key, data || []); return data || [];
  }
  /* Indique clairement quand la migration SQL V29 n'a pas encore été exécutée. */
  function explain(err) {
    const m = String(err?.message || err || '');
    if (/relation "?[\w.]+"? does not exist|Could not find the (table|function)|schema cache|PGRST20[25]|42P01|42883/i.test(m)) return 'Module pas encore activé : exécutez supabase/myra_v29_extensions.sql dans Supabase (SQL Editor).';
    return m;
  }
  const isMissing = err => /relation "?[\w.]+"? does not exist|Could not find the (table|function)|schema cache|PGRST20[25]|42P01|42883/i.test(String(err?.message || err || ''));
  function errorPanel(host, err) {
    const missing = isMissing(err);
    host.innerHTML = `<div class="panel ext-error"><h3><i class="fa-solid fa-${missing ? 'puzzle-piece' : 'circle-info'}" aria-hidden="true"></i> ${missing ? 'Module pas encore activé' : 'Module indisponible'}</h3><p class="muted">${missing ? 'Les tables de ce module n’existent pas encore dans votre base Supabase. L’activation se fait une seule fois, en 2 minutes, pour tous les nouveaux modules.' : esc(explain(err))}</p>${missing ? '<div class="actions" style="margin-top:12px"><button type="button" class="btn primary" data-activate><i class="fa-solid fa-wand-magic-sparkles"></i> Activer les modules</button></div>' : ''}</div>`;
    host.querySelector('[data-activate]')?.addEventListener('click', () => A().navigate('activation'));
  }
  function loading(host, label = 'Chargement…') { host.innerHTML = `<div class="loading"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> ${esc(label)}</div>`; }

  /* Fenêtre modale simple : renvoie { el, close }. */
  function modal(title, body, foot = '', opts = {}) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-backdrop"><${opts.form ? 'form' : 'section'} class="modal ext-modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h3>${esc(title)}</h3>${opts.sub ? `<span class="muted">${esc(opts.sub)}</span>` : ''}</div><button type="button" class="icon-action" data-close aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</${opts.form ? 'form' : 'section'}></div>`;
    const el = root.querySelector('.modal'); const close = () => { root.innerHTML = ''; };
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    root.querySelector('.modal-backdrop').addEventListener('mousedown', e => { if (e.target === e.currentTarget) close(); });
    return { el, close };
  }

  /* En-tête de page commun. */
  function head(title, desc, actions = '') { return `<div class="page-head"><div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`; }
  function kpis(list) { return `<div class="kpi-row ext-kpis">${list.map(([ico, label, value, foot, cls]) => `<div class="kpi ${cls || 'k-green'}"><span class="kpi-ico"><i class="fa-solid ${ico}" aria-hidden="true"></i></span><div><small>${esc(label)}</small><b>${value}</b><em>${foot || ''}</em></div></div>`).join('')}</div>`; }
  function table(cols, rows, empty = 'Rien à afficher pour le moment.') {
    return `<div class="table-card ext-table"><div class="table-wrap"><table class="cards-m"><thead><tr>${cols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr class="empty-row"><td colspan="${cols.length}"><div class="empty"><span class="empty-ico"><i class="fa-solid fa-inbox" aria-hidden="true"></i></span><b>${esc(empty)}</b></div></td></tr>`}</tbody></table></div></div>`;
  }

  /* QR code en SVG (bibliothèque locale vendor/qrcode-generator). */
  function qrSvg(text, cell = 3) {
    if (typeof window.qrcode !== 'function') return '';
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
    const q = window.qrcode(0, 'M'); q.addData(String(text)); q.make(); return q.createSvgTag(cell, 0);
  }

  /* Documents imprimables : tous passent par le gabarit unique MyraDoc (js/doc-kit.js). */
  async function printDoc(d) {
    const app = A(); const win = app?.openPrintWindow ? app.openPrintWindow() : window.open('', '_blank');
    if (!win) { app?.toast('Autorisez les fenêtres pour imprimer.', true); return; }
    let c = {}; try { c = await app.getCompanyDocumentInfo(); } catch (_) {}
    window.MyraDoc.write(win, { company: c, ...d });
  }
  /* Planches brutes (étiquettes adhésives) : mise en page fixe au millimètre, hors gabarit. */
  function printHtml(title, inner, css = '') {
    const w = A()?.openPrintWindow ? A().openPrintWindow() : window.open('', '_blank'); if (!w) { A().toast('Autorisez les fenêtres pour imprimer.', true); return; }
    w.document.open();
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{font:13px/1.45 Inter,'DM Sans',Arial,sans-serif;color:#1b1e1c;margin:0}.bar{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;background:#f3f4f3}.bar button{font:500 13.5px Inter,Arial,sans-serif;border:1px solid #dcdfdc;background:#fff;border-radius:999px;padding:9px 18px;cursor:pointer}.bar .dark{background:#171a18;color:#fff;border-color:#171a18}@media print{.bar{display:none}}${css}</style></head><body><div class="bar"><button type="button" id="mdClose">Fermer</button><button type="button" class="dark" id="mdPrint">Imprimer / PDF</button></div>${inner}</body></html>`);
    w.document.close();
    w.document.getElementById('mdPrint').onclick = () => { w.focus(); w.print(); };
    w.document.getElementById('mdClose').onclick = () => { if (w.__myraPrintFrame) w.__myraPrintFrame.remove(); else w.close(); };
  }

  /* Lecture de codes-barres / QR par la caméra (API BarcodeDetector du navigateur). */
  async function scan(title = 'Scanner un code') {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      const typed = prompt('La lecture par caméra n’est pas disponible sur ce navigateur.\nSaisissez le code-barres ou la référence :');
      return typed ? typed.trim() : null;
    }
    return new Promise(resolve => {
      const m = modal(title, `<div class="scan-box"><video playsinline muted></video><div class="scan-frame"></div></div><p class="muted">Placez le code dans le cadre. La lecture est automatique.</p><label class="field">Ou saisir le code<input id="scanManual" inputmode="text" autocomplete="off"></label>`, `<button type="button" class="btn light" data-close>Annuler</button><button type="button" class="btn primary" id="scanOk">Valider la saisie</button>`);
      const video = m.el.querySelector('video'); let stream, stopped = false;
      const finish = v => { stopped = true; try { stream && stream.getTracks().forEach(t => t.stop()); } catch (_) {} m.close(); resolve(v); };
      m.el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => finish(null)));
      m.el.querySelector('#scanOk').addEventListener('click', () => finish(m.el.querySelector('#scanManual').value.trim() || null));
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => {
        stream = s; video.srcObject = s; video.play();
        const tick = async () => { if (stopped) return; try { const codes = await detector.detect(video); if (codes[0]?.rawValue) { if (navigator.vibrate) navigator.vibrate(60); return finish(codes[0].rawValue); } } catch (_) {} requestAnimationFrame(tick); };
        tick();
      }).catch(() => { m.el.querySelector('.scan-box').innerHTML = '<p class="muted">Accès à la caméra refusé. Saisissez le code ci-dessous.</p>'; });
    });
  }
  /* Retrouve un produit à partir d'un code scanné : code-barres, référence ou QR d'étiquette Myra. */
  function findProduct(products, code) {
    if (!code) return null; const c = String(code).trim(); const lot = /^MYRA:LOT:([^:]+)/i.exec(c);
    if (lot) return { lotNumber: lot[1] };
    const pid = /^MYRA:PRODUIT:([0-9a-f-]{36})/i.exec(c);
    return products.find(p => (pid && p.id === pid[1]) || (p.barcode && p.barcode === c) || (p.sku && p.sku.toLowerCase() === c.toLowerCase())) || null;
  }

  /* Détection de la migration V29 : tant qu'elle n'est pas exécutée, les nouveaux champs
     (plafond de crédit, code-barres…) ne sont pas ajoutés aux formulaires existants,
     pour ne pas bloquer l'enregistrement des clients et des produits. */
  const readyFns = []; let v29 = null;
  try { v29 = localStorage.getItem('myra_v29_ready') === '1' ? true : null; } catch (_) {}
  let applied = false;
  function applyReady(app) { if (applied) return; applied = true; readyFns.forEach(fn => { try { fn(app); } catch (e) { console.error(e); } }); }
  function whenReady(fn) { readyFns.push(fn); if (applied) { try { fn(A()); } catch (e) { console.error(e); } } }
  async function probe() {
    const app = A(); if (!app?.sb || !navigator.onLine) return;
    const { error } = await app.sb.from('product_lots').select('id').limit(1);
    const ok = !error; const was = v29; v29 = ok;
    try { localStorage.setItem('myra_v29_ready', ok ? '1' : '0'); } catch (_) {}
    if (ok) applyReady(app);
  }
  let probed = false;
  window.addEventListener('myra:navigate', () => { if (probed) return; probed = true; if (v29) applyReady(A()); setTimeout(probe, 400); });
  /* Ajoute un champ à un formulaire existant (une seule fois). */
  function addField(app, page, field, section) {
    const c = app.config[page]; if (!c || c.fields.some(f => f[0] === field[0])) return; c.fields.push(field);
    if (section && app.formSections?.[page]) { const s = app.formSections[page].find(x => x[0] === section); if (s && !s[2].includes(field[0])) s[2].push(field[0]); }
  }

  const waNumber = phone => { let d = String(phone || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); else if (!d.startsWith('242') && (d.startsWith('0') || d.length <= 9)) d = '242' + d; return d; };

  window.MyraX = { loadKeyed, isMissing, EXT, A, whenReady, addField, isReady: () => v29, esc, money, num, fdate, iso, today, monthStart, addDays, daysBetween, on, menu, load, explain, errorPanel, loading, modal, head, kpis, table, qrSvg, printHtml, printDoc, scan, findProduct, waNumber };
})();
