// Tous les documents imprimables passent par le gabarit unique (js/doc-kit.js) : rendu, contenu, absence d'erreur
const fs = require('fs'); const path = require('path'); const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,sales,products,customers};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', ROOT, path.join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, sales, products } = mod.exports; const OUT = path.join(__dirname, 'output', 'documents'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);
DB.customer_order_items.push({ id: 'i1', order_id: DB.customer_orders[0].id, product_name: products[0].name, unit: products[0].unit, quantity: 3, unit_price: 4500, line_total: 13500 }, { id: 'i2', order_id: DB.customer_orders[0].id, product_name: products[4].name, unit: products[4].unit, quantity: 2, unit_price: 2000, line_total: 4000 });

srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`; const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' }); await setup(ctx, true);
  await ctx.addInitScript(() => { try { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); } catch (_) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(base); await page.waitForTimeout(2200);
  const frameDoc = async () => { await page.waitForTimeout(1300); const f = page.frames().find(fr => fr !== page.mainFrame() && fr.url() === 'about:blank' && fr.parentFrame()); return f; };
  async function grab(name, expect) {
    const f = await frameDoc(); if (!f) { check(name, false, 'aucun document ouvert'); return; }
    const info = await f.evaluate(() => ({ kit: !!document.querySelector('.paper .hero h1'), h1: document.querySelector('h1')?.innerText, text: document.body.innerText, logo: [...document.images].every(i => i.complete && i.naturalWidth > 0), btn: !!document.getElementById('mdPrint'), inline: document.querySelectorAll('[onclick]').length + document.querySelectorAll('script').length, h: document.documentElement.scrollHeight }));
    const missing = expect.filter(e => !info.text.includes(e));
    check(`${name} : gabarit unique, logo, contenu`, info.kit && info.logo && info.btn && info.inline === 0 && !missing.length, missing.length ? 'manque : ' + missing.join(', ') : info.h1);
    await page.setViewportSize({ width: 1100, height: Math.min(info.h + 20, 2600) }); await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name.replace(/[^\wÀ-ÿ]+/g, '-')}.png` });
    await page.setViewportSize({ width: 1100, height: 900 });
    await f.evaluate(() => document.getElementById('mdClose').click()).catch(() => {}); await page.waitForTimeout(300);
    check(`${name} : bouton Fermer`, !page.frames().includes(f));
  }
  const paid = sales.find(s => s.status === 'paid'), part = sales.find(s => s.status === 'partially_paid');
  await page.evaluate(id => window.MyraApp.printInvoice(id), paid.id); await grab('Facture payée', ['Facture', 'Articles', 'Récapitulatif', 'Montants', 'Total TTC', 'payée']);
  await page.evaluate(id => window.MyraApp.printInvoice(id), part.id); await grab('Facture partielle', ['Reste à payer', 'partiellement payée']);
  await page.evaluate(id => window.MyraApp.printOrderSlip(id), part.id); await grab('Bon de commande (vente)', ['Bon de commande', 'NON VALABLE COMME REÇU', 'Signature du client']);
  await page.evaluate(() => window.MyraApp.navigate('commandes')); await page.waitForTimeout(1200);
  await page.click(`#orderRows tr[data-id="${DB.customer_orders[0].id}"]`); await page.waitForTimeout(1200); await page.click('#odPrint');
  await grab('Bon de commande client', ['Bon de commande', products[0].name, 'Livraison']);
  await page.evaluate(() => { document.getElementById('modalRoot').innerHTML = ''; });
  const pay = DB.payments.find(p => p.sale_id === paid.id) || DB.payments[0];
  await page.evaluate(id => window.MyraApp.printReceipt(id), pay.id); await grab('Reçu de paiement', ['Reçu de paiement', 'Montant encaissé', 'Mode de paiement']);
  await page.evaluate(() => window.MyraApp.printRecord('Grâce Mabiala', 'client', [['Nom', 'Grâce Mabiala'], ['Téléphone', '06 600 00 01'], ['Points', '<b>340</b>']])); await grab('Fiche client', ['Fiche · Client', 'Détails', 'Téléphone']);
  await page.evaluate(() => window.MyraApp.printList('customers', window.MyraApp.state.cache.customers || [])); await grab('Liste des clients', ['ligne']);
  const ev = DB.catering_events[0];
  await page.evaluate(e => window.MyraApp.runHooks('detailAction', 'ev-quote', 'catering', e), ev); await grab('Devis traiteur', [ev.status === 'quote' ? 'Devis traiteur' : 'Confirmation traiteur', 'Prestation traiteur par personne', 'Bon pour accord']);
  await page.evaluate(g => window.MyraApp.runHooks('detailAction', 'gc-print', 'gift_cards', g), DB.gift_cards[0]); await grab('Bon cadeau', ['Bon cadeau', 'MYRA-ABC-123', 'Valeur']);
  for (const [pg, btn, name, exp] of [['payroll', '#pyPrint', 'État de paie', ['État de paie', 'Net à payer', 'Visa comptabilité']], ['forecast', '#fcPrint', 'Plan de production', ['Plan de production', 'À produire']], ['report', '#rpPrint', 'Rapport du mois', ['Rapport du mois', 'Chiffres clés', 'Meilleurs clients']], ['shop', '#shopPrint', 'Affiche boutique', ['Commandez en ligne', 'Scannez ce code']]]) {
    await page.evaluate(x => window.MyraApp.navigate(x), pg); await page.waitForTimeout(1500);
    if (!(await page.$(btn))) { check(name, false, 'bouton absent'); continue; }
    await page.click(btn); await grab(name, exp);
  }
  check('Application : aucune erreur JavaScript', errs.length === 0, errs.join(' | '));
  await ctx.close();
  // Espace client (page publique, CSP stricte appliquée comme sur Vercel)
  const vercel = JSON.parse(fs.readFileSync(ROOT + '/vercel.json', 'utf8')); const pub = vercel.headers.find(h => h.source.includes('client')).headers.find(h => h.key === 'Content-Security-Policy').value;
  const c2 = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(c2, 'visitor');
  await c2.route('**/client.html*', async r => { const res = await r.fetch(); r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': pub } }); });
  const p2 = await c2.newPage(); const csp = []; p2.on('console', m => /Content Security Policy|Refused/.test(m.text()) && csp.push(m.text()));
  await p2.goto(base + 'client.html?t=' + 'a'.repeat(64)); await p2.waitForTimeout(1500);
  await p2.click('.pub-sale-head'); const [pop] = await Promise.all([c2.waitForEvent('page'), p2.click('[data-print]')]); await pop.waitForTimeout(1500);
  await pop.waitForTimeout(1200); const t = await pop.evaluate(() => ({ kit: !!document.querySelector('.paper .hero'), text: document.body.innerText, logo: [...document.images].some(i => /assets\/logo-les-saveurs-de-myra\.png$/.test(i.src)) }));
  check('Espace client : facture au même gabarit (CSP stricte respectée)', t.kit && t.logo && /Reste à payer|Total/.test(t.text) && csp.length === 0, JSON.stringify({kit:t.kit,logo:t.logo,txt:t.text.slice(0,80)}) + ' ' + csp.join(' | ').slice(0, 250));
  await pop.screenshot({ path: `${OUT}/Facture-espace-client-mobile.png`, fullPage: true });
  await b.close(); srv.close();
  results.forEach(r => console.log(r.join(' · ')));
  const ok = results.filter(r => r[0].startsWith('OK')).length; console.log(`\n${ok}/${results.length} vérifications réussies`); process.exit(ok === results.length ? 0 : 1);
});
