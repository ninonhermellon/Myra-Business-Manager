// Tests fonctionnels V29 (faux Supabase du banc d'essai harness29.js)
const fs = require('fs');
const { chromium } = require('playwright');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,REQLOG,uid,products,customers};');
const mod = { exports: {} };
new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', require('path').resolve(__dirname, '../..'), require('path').join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, REQLOG, uid, products, customers } = mod.exports;
const results = [];
const check = (name, ok, detail = '') => { results.push([ok ? 'OK ' : 'ÉCHEC', name, detail]); };

srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await setup(ctx, true);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept());
  const posts = []; page.on('request', r => { if (['POST', 'PATCH'].includes(r.method()) && /supabase/.test(r.url())) posts.push({ url: r.url(), body: r.postData() }); });
  await page.goto(base); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '#toastRoot,#toastRoot *{pointer-events:none!important}' });
  // la migration est détectée (sonde) -> champs ajoutés
  await page.evaluate(() => window.MyraApp.navigate('customers')); await page.waitForTimeout(1200);
  const fields = await page.evaluate(() => window.MyraApp.config.customers.fields.map(f => f[0]));
  check('Fiche client : nouveaux champs (plafond, type, anniversaire)', ['credit_limit', 'price_tier', 'birth_date'].every(k => fields.includes(k)), fields.join(','));

  // ---- Vente : tarifs automatiques
  await page.evaluate(() => window.MyraApp.openSaleWorkflow()); await page.waitForTimeout(1200);
  const f = '#saleWorkflowForm';
  await page.selectOption(`${f} select[name=customer_id]`, customers[3].id); await page.waitForTimeout(600);
  await page.selectOption(`${f} .item-product`, products[0].id); await page.waitForTimeout(400);
  let price = await page.inputValue(`${f} .item-price`);
  check('Prix négocié appliqué (3 900 au lieu de 4 500)', price === '3900', price);
  await page.selectOption(`${f} select[name=customer_id]`, customers[1].id); await page.waitForTimeout(600);
  await page.fill(`${f} .item-qty`, '12'); await page.waitForTimeout(300);
  price = await page.inputValue(`${f} .item-price`);
  check('Prix par quantité dès 10 (4 000)', price === '4000', price);
  // ---- Bon cadeau
  await page.fill(`${f} input[name=gift_code]`, 'myra-abc-123'); await page.click('#gcApply'); await page.waitForTimeout(600);
  const total = await page.textContent('#saleGrandTotal'); const line = await page.textContent('#extraDiscountLine');
  check('Bon cadeau : 6 000 FCFA déduits du total', /6\s?000/.test(line) && /42\s?000/.test(total.replace(/ /g, ' ')), `${line.trim()} | total ${total}`);
  // ---- Scan : bouton présent
  check('Bouton « Scanner » dans la vente', await page.isVisible(`${f} button:has-text("Scanner")`));
  posts.length = 0;
  await page.click(`${f} button[type=submit]`); await page.waitForTimeout(1500);
  const salePost = posts.find(p => /rest\/v1\/sales/.test(p.url)); const redeem = posts.find(p => /rpc\/redeem_gift_card/.test(p.url));
  const saleBody = salePost ? JSON.parse(salePost.body) : {};
  check('Vente enregistrée avec la remise du bon dans « discount »', salePost && Number(saleBody.discount) === 6000 && Number(saleBody.total) === 42000, salePost ? `discount ${saleBody.discount}, total ${saleBody.total}` : 'pas de POST');
  check('Bon cadeau débité avec le n° de vente', redeem && /p_sale_id/.test(redeem.body), redeem?.body || 'pas d’appel');
  check('Solde du bon mis à jour (0)', DB.gift_cards[0].balance === 0, String(DB.gift_cards[0].balance));

  // ---- Plafond de crédit
  await page.evaluate(() => window.MyraApp.openSaleWorkflow()); await page.waitForTimeout(1200);
  await page.selectOption(`${f} select[name=sale_type]`, 'credit');
  await page.selectOption(`${f} select[name=customer_id]`, customers[4].id); await page.waitForTimeout(700);
  await page.selectOption(`${f} .item-product`, products[3].id); await page.fill(`${f} .item-qty`, '30'); await page.waitForTimeout(300);
  const info = await page.textContent('#creditInfo').catch(() => '');
  posts.length = 0; await page.click(`${f} button[type=submit]`); await page.waitForTimeout(1000);
  const toast = await page.evaluate(() => [...document.querySelectorAll('#toastRoot *')].map(e => e.textContent).join(' | '));
  check('Encours et plafond affichés pour une vente à crédit', /plafond/i.test(info), info.trim());
  check('Vente à crédit refusée au-delà du plafond', /Plafond de crédit dépassé/.test(toast) && !posts.some(p => /rest\/v1\/sales/.test(p.url)), toast.slice(0, 160));
  await page.evaluate(() => { document.getElementById('modalRoot').innerHTML = ''; });

  // ---- Étiquettes : QR code
  await page.evaluate(() => window.MyraApp.navigate('labels')); await page.waitForTimeout(1200);
  check('Étiquette : aperçu avec QR code', await page.$$eval('#lblPreview svg', x => x.length) === 1);
  // ---- Commandes récurrentes
  await page.evaluate(() => window.MyraApp.navigate('recurring')); await page.waitForTimeout(1200);
  REQLOG.length = 0; await page.click('#recGen'); await page.waitForTimeout(800);
  check('Commandes récurrentes : création des commandes dues', REQLOG.includes('RPC generate_due_recurring_orders'));
  // ---- Inventaire : démarrer, compter, appliquer
  await page.evaluate(() => window.MyraApp.navigate('inventory')); await page.waitForTimeout(1000);
  await page.click('#invNew'); await page.waitForTimeout(1000);
  await page.click('#invManual'); await page.waitForTimeout(400); await page.click('.ext-modal button[type=submit]'); await page.waitForTimeout(400);
  await page.fill('.ext-modal input[name=q]', '7'); await page.click('.ext-modal button[type=submit]'); await page.waitForTimeout(1200);
  check('Inventaire : ligne comptée enregistrée', DB.inventory_lines.length === 1 && Number(DB.inventory_lines[0].counted_quantity) === 7);
  REQLOG.length = 0; await page.click('#invApply'); await page.waitForTimeout(1000);
  check('Inventaire : écarts appliqués', REQLOG.includes('RPC apply_inventory'));
  // ---- Transfert entre lieux
  await page.evaluate(() => window.MyraApp.navigate('by_location')); await page.waitForTimeout(1000);
  await page.click('#locMove'); await page.waitForTimeout(400); await page.fill('.ext-modal input[name=qty]', '3');
  REQLOG.length = 0; await page.click('.ext-modal button[type=submit]'); await page.waitForTimeout(800);
  check('Stock par lieu : transfert envoyé', REQLOG.includes('RPC transfer_stock'));
  // ---- Pointage
  await page.evaluate(() => window.MyraApp.navigate('payroll')); await page.waitForTimeout(1000);
  await page.click('[data-st="late"] >> nth=1'); await page.waitForTimeout(600);
  check('Pointage : présence enregistrée (en retard)', DB.attendance.some(a => a.status === 'late'));
  // ---- Assistant
  await page.evaluate(() => window.MyraApp.navigate('assistant')); await page.waitForTimeout(800);
  await page.click('[data-q="top"]'); await page.waitForTimeout(1500);
  const top = await page.textContent('#chatLog');
  check('Assistant : réponse rapide « meilleures ventes »', /FCFA/.test(top) && /vendus/.test(top), top.slice(-120));
  await page.fill('#chatForm input', 'Quel est mon meilleur produit ?'); await page.press('#chatForm input', 'Enter'); await page.waitForTimeout(1500);
  check('Assistant : question libre envoyée au serveur', /Réponse de test/.test(await page.textContent('#chatLog')));
  // ---- Messages
  await page.evaluate(() => window.MyraApp.navigate('messages')); await page.waitForTimeout(1200);
  await page.click('#msgGo'); await page.waitForTimeout(600);
  const links = await page.$$eval('#msgList a', a => a.map(x => x.href));
  check('Messages : liens WhatsApp personnalisés', links.length > 0 && links.every(h => h.startsWith('https://wa.me/242')) && !decodeURIComponent(links[0]).includes('{prenom}'), `${links.length} liens`);
  // ---- Bon cadeau : actions dans la fiche
  await page.evaluate(() => window.MyraApp.navigate('gift_cards')); await page.waitForTimeout(1200);
  await page.click('tr[data-id]'); await page.waitForTimeout(500);
  check('Bon cadeau : actions « Imprimer » dans la fiche', await page.isVisible('[data-ext="gc-print"]'));
  // ---- Tableau de bord : alertes
  await page.evaluate(() => { document.getElementById('modalRoot').innerHTML = ''; window.MyraApp.navigate('dashboard'); }); await page.waitForTimeout(2000);
  const alerts = await page.$$eval('#extDash .ext-alert', a => a.map(x => x.textContent.trim().slice(0, 50)));
  check('Tableau de bord : alertes DLC et anniversaires', alerts.length >= 2, alerts.join(' | '));

  check('Aucune erreur JavaScript', errs.length === 0, errs.join(' | '));
  results.forEach(r => console.log(r[0], r[1], r[2] ? '→ ' + r[2] : ''));
  console.log(`\n${results.filter(r => r[0] === 'OK ').length}/${results.length} vérifications réussies`);
  await b.close(); srv.close();
});
