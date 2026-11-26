// Tests V37 : avis détaillés (boutique, avis.html, écran Avis clients avec relances, réponse et masquage)
const fs = require('fs'); const path = require('path'); const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,products,customers};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', ROOT, path.join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, products, customers } = mod.exports; const OUT = path.join(__dirname, 'output', 'v37'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);

srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`; const b = await chromium.launch();
  // ---------- Boutique (téléphone)
  const m = await b.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' }); await setup(m, 'visitor');
  const p = await m.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + 'boutique.html'); await p.waitForTimeout(1500);
  await p.click(`#grid [data-open="${products[0].id}"]`); await p.waitForTimeout(1200);
  const sum = await p.textContent('#rvBody');
  check('Fiche produit : note, critères et avis clients', /2 avis/.test(sum) && /Livraison/.test(sum) && /meilleure marinade/.test(sum) && /Achat vérifié/.test(sum), sum.replace(/\s+/g, ' ').slice(0, 160));
  await p.locator('#pdReviews').scrollIntoViewIfNeeded(); await p.screenshot({ path: OUT + '/fiche-avis.png' });
  await p.click('#pdRate'); await p.waitForTimeout(400);
  check('Formulaire : 5 critères (produit, boutique, service, livraison, SAV)', (await p.$$('#rvForm .rv-crit')).length === 5);
  await p.click('#rvSend'); await p.waitForTimeout(200);
  check('Formulaire : note du produit obligatoire', /noter le produit/.test(await p.textContent('#rvErr')));
  await p.click('.rv-crit[data-crit="product"] [data-n="4"]'); await p.click('.rv-crit[data-crit="delivery"] [data-n="5"]'); await p.click('.rv-crit[data-crit="after_sales"] [data-n="3"]');
  await p.click('.rv-crit[data-crit="after_sales"] [data-n="3"]');
  await p.fill('#rvForm [name=comment]', 'Très bon goût, livraison rapide.'); await p.fill('#rvForm [name=name]', 'Awa'); await p.fill('#rvForm [name=phone]', '069998877');
  await p.screenshot({ path: OUT + '/formulaire-avis.png' });
  const n0 = DB.product_reviews.length; await p.click('#rvSend'); await p.waitForTimeout(800);
  const nr = DB.product_reviews[DB.product_reviews.length - 1];
  check('Avis boutique enregistré (critères, « Non concerné » respecté)', DB.product_reviews.length === n0 + 1 && nr.rating_product === 4 && nr.rating_delivery === 5 && nr.rating_after_sales === null && nr.comment.startsWith('Très bon'), JSON.stringify({ p: nr.rating_product, d: nr.rating_delivery, a: nr.rating_after_sales }));
  check('Confirmation affichée', /Merci Awa/.test(await p.textContent('.ok')));
  // avis.html (lien envoyé après livraison)
  await p.goto(base + 'avis.html?t=' + 'f'.repeat(64)); await p.waitForTimeout(1200);
  check('avis.html : 5 critères', (await p.$$('#rvForm .rv-crit')).length === 5);
  await p.click('.rv-crit[data-crit="product"] [data-n="5"]'); await p.click('.rv-crit[data-crit="service"] [data-n="3"]'); await p.click('#send'); await p.waitForTimeout(800);
  const orv = DB.order_reviews.find(r => r.token === 'f'.repeat(64));
  check('avis.html : notes par critère enregistrées', orv.rating === 4 && orv.rating_product === 5 && orv.rating_service === 3 && !!orv.submitted_at, JSON.stringify({ r: orv.rating, p: orv.rating_product, s: orv.rating_service }));
  await p.screenshot({ path: OUT + '/avis-merci.png' });
  check('Aucune erreur JavaScript (pages publiques)', errs.length === 0, errs.join(' | '));
  await m.close();

  // ---------- Application : écran Avis clients
  orv.submitted_at = null; orv.rating = null; orv.requested_at = new Date(Date.now() - 6 * 864e5).toISOString();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }); await setup(ctx, true);
  await ctx.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); window.open = u => { (window.__opened = window.__opened || []).push(u); return null; }; });
  const a = await ctx.newPage(); const aerr = []; a.on('pageerror', e => aerr.push(e.message));
  await a.goto(base); await a.waitForTimeout(2000); await a.evaluate(() => window.MyraApp.navigate('reviews')); await a.waitForTimeout(1500);
  const txt = await a.textContent('#pageContent');
  check('Écran : notes par critère (5) et point à améliorer', (await a.$$('.av-c')).length === 5 && /Point à améliorer/.test(txt));
  check('Écran : avis boutique et après commande réunis', /Depuis la boutique|Boutique/.test(txt) && (await a.$$('.av-item')).length >= 3);
  await a.screenshot({ path: OUT + '/ecran-avis.png', fullPage: true });
  const before = orv.reminder_count || 0;
  await a.click(`[data-remind="${orv.id}"]`); await a.waitForTimeout(600);
  const op = await a.evaluate(() => (window.__opened || []).slice(-1)[0] || '');
  check('Relance : WhatsApp avec le lien d’avis + compteur de relances', /avis\.html%3Ft%3D/.test(op) && orv.reminder_count === before + 1 && !!orv.reminded_at, decodeURIComponent(op).slice(0, 120));
  await a.selectOption('#avFilter', 'low'); await a.waitForTimeout(800);
  check('Filtre « 3 étoiles ou moins »', (await a.$$('.av-item')).length >= 1 && !(await a.textContent('#pageContent')).includes('meilleure marinade'));
  const low = DB.product_reviews.find(r => r.author_name === 'Paul Ndinga');
  await a.click(`[data-reply="${low.id}"]`); await a.waitForTimeout(300); await a.fill('#avReply', 'Toutes nos excuses, nous avons revu nos délais de livraison.'); await a.click('#avReplyOk'); await a.waitForTimeout(800);
  check('Répondre publiquement à un avis', /revu nos délais/.test(low.reply || ''));
  await a.click(`[data-hide="${low.id}"]`); await a.waitForTimeout(800);
  check('Masquer un avis de la boutique', low.status === 'hidden');
  check('Aucune erreur JavaScript (application)', aerr.length === 0, aerr.join(' | '));
  await ctx.close(); await b.close(); srv.close();
  results.forEach(r => console.log(r.join(' · ')));
  const ok = results.filter(r => r[0].startsWith('OK')).length; console.log(`\n${ok}/${results.length} vérifications réussies`); process.exit(ok === results.length ? 0 : 1);
});
