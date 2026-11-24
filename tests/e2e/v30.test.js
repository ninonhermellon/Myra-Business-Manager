// Tests fonctionnels V30 (faux Supabase du banc d'essai)
const fs = require('fs'); const path = require('path'); const { chromium, devices } = require('playwright');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,REQLOG,uid,products,customers,sales};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', require('path').resolve(__dirname, '../..'), require('path').join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, REQLOG, customers } = mod.exports; const OUT = require('path').join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);
srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`; const b = await chromium.launch();
  // ---- Pages publiques (visiteur, sans session)
  const pub = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(pub, false);
  const pp = await pub.newPage(); const perrs = []; pp.on('pageerror', e => perrs.push(e.message));
  await pp.goto(base + 'client.html?t=' + 'a'.repeat(64)); await pp.waitForTimeout(1500);
  const portal = await pp.textContent('#app'); await pp.screenshot({ path: OUT + '/public-client.png', fullPage: true });
  check('Espace client : bonjour, reste à payer, factures', /Bonjour Grâce/.test(portal) && /Reste à payer/.test(portal) && /VTE-/.test(portal), portal.replace(/\s+/g, ' ').slice(0, 120));
  await pp.click('.pub-sale-head'); await pp.waitForTimeout(200);
  check('Espace client : détail d’une facture', await pp.isVisible('.pub-sale-body table'));
  await pp.goto(base + 'client.html?t=' + 'z'.repeat(64)); await pp.waitForTimeout(1200);
  check('Espace client : faux lien refusé', /Lien indisponible/.test(await pp.textContent('#app')));
  await pp.goto(base + 'avis.html?t=' + 'c'.repeat(64)); await pp.waitForTimeout(1200);
  await pp.screenshot({ path: OUT + '/public-avis.png' });
  await pp.click('[data-n="5"]'); await pp.fill('#comment', 'Parfait !'); await pp.click('#send'); await pp.waitForTimeout(800);
  check('Avis : note 5 étoiles enregistrée', /Merci beaucoup/.test(await pp.textContent('#app')) && DB.order_reviews.find(r => r.token === 'c'.repeat(64)).rating === 5);
  await pp.goto(base + 'avis.html?t=' + 'c'.repeat(64)); await pp.waitForTimeout(1000);
  check('Avis : second envoi impossible', /déjà donné votre avis/.test(await pp.textContent('#app')));
  check('Pages publiques sans erreur JS', perrs.length === 0, perrs.join(' | '));
  await pub.close();
  // ---- Équipe
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }); await setup(ctx, true);
  await ctx.addInitScript(() => { try { localStorage.setItem('myra_v29_ready', '1'); } catch (_) {} window.open = u => { (window.__opened = window.__opened || []).push(u); return null; }; });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  const popups = []; ctx.on('page', p => popups.push(p.url()));
  await page.goto(base); await page.waitForTimeout(2000); await page.addStyleTag({ content: '#toastRoot,#toastRoot *{pointer-events:none!important}' });
  const alerts = await page.$$eval('#extDash .ext-alert', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));
  check('Tableau de bord : alerte « Objectif du mois »', alerts.some(a => /Objectif du mois/.test(a)), alerts.join(' | '));
  await page.evaluate(() => window.MyraApp.navigate('portal_links')); await page.waitForTimeout(1200);
  const before = DB.customer_portal_links.length; await page.click('[data-send]:not(:first-child) >> nth=1').catch(() => page.click('tr:nth-child(2) [data-send]')); await page.waitForTimeout(1200);
  const op1 = await page.evaluate(() => (window.__opened || []).slice(-1)[0] || ''); check('Espace client : lien créé et envoyé sur WhatsApp', DB.customer_portal_links.length === before + 1 && /wa\.me/.test(op1) && /client\.html%3Ft%3D/.test(op1), decodeURIComponent(op1).slice(0, 160));
  await page.evaluate(() => window.MyraApp.navigate('reviews')); await page.waitForTimeout(1500);
  const nrev = DB.order_reviews.length; await page.click('[data-ask] >> nth=0'); await page.waitForTimeout(1000);
  const op2 = await page.evaluate(() => (window.__opened || []).slice(-1)[0] || ''); check('Avis : demande créée et envoyée', DB.order_reviews.length === nrev + 1 && /avis\.html%3Ft%3D/.test(op2), decodeURIComponent(op2).slice(0, 160));
  await page.evaluate(() => window.MyraApp.navigate('referrals')); await page.waitForTimeout(1500);
  await page.click('[data-reward] >> nth=0'); await page.waitForTimeout(300); await page.click('.ext-modal button[type=submit]'); await page.waitForTimeout(1200);
  check('Parrainage : bon cadeau créé pour le parrain', DB.referral_rewards.length === 1 && DB.gift_cards.some(g => /^PARR-/.test(g.code)), DB.gift_cards.slice(-1)[0]?.code);
  await page.evaluate(() => window.MyraApp.navigate('goals')); await page.waitForTimeout(1200);
  await page.fill('#glForm input[name=sales_target]', '1200000'); await page.click('#glForm button[type=submit]'); await page.waitForTimeout(900);
  check('Objectifs : objectif modifié', Number(DB.business_goals[0].sales_target) === 1200000);
  await page.evaluate(() => window.MyraApp.navigate('report')); await page.waitForTimeout(1800);
  const rep = await page.textContent('#pageContent');
  check('Rapport : chiffres, marge et comparaison', /Chiffre d’affaires/.test(rep) && /Marge sur les produits/.test(rep) && /vs /.test(rep));
  await page.click('#rpAiBtn'); await page.waitForTimeout(1200);
  check('Rapport : analyse de l’assistant', /Réponse de test/.test(await page.textContent('#rpAi')));
  // Lieu de vente dans la vente
  await page.evaluate(() => window.MyraApp.openSaleWorkflow()); await page.waitForTimeout(1500);
  const f = '#saleWorkflowForm'; const hasLoc = await page.$(`${f} select[name=location_id]`);
  check('Vente : choix du lieu de vente', !!hasLoc);
  if (hasLoc) {
    await page.selectOption(`${f} select[name=location_id]`, { label: 'Boutique Poto-Poto' }); await page.selectOption(`${f} .item-product`, { index: 1 }); await page.waitForTimeout(300);
    const pre = JSON.stringify(DB.sales.map(s => s.id)); await page.evaluate(() => document.querySelector('#saleWorkflowForm').requestSubmit()); await page.waitForTimeout(1500);
    const created = DB.sales.find(s => !pre.includes(s.id)); check('Vente : lieu enregistré sur la vente', created && created.location_id === DB.stock_locations.find(l => l.name === 'Boutique Poto-Poto').id, created?.location_id || 'aucune vente');
    check('Vente : lieu mémorisé sur l’appareil', !!(await page.evaluate(() => localStorage.getItem('myra_sale_location'))));
  }
  // Affichage
  await page.evaluate(() => { document.getElementById('modalRoot').innerHTML = ''; window.MyraApp.navigate('display'); }); await page.waitForTimeout(600);
  await page.click('[data-theme="dark"]'); await page.click('[data-size="lg"]'); await page.waitForTimeout(300);
  const cls = await page.evaluate(() => document.documentElement.className);
  check('Affichage : mode sombre et grand texte', /theme-dark/.test(cls) && /text-lg/.test(cls), cls);
  await page.evaluate(() => window.MyraApp.navigate('dashboard')); await page.waitForTimeout(1500); await page.screenshot({ path: OUT + '/desktop-dark.png' });
  await page.reload(); await page.waitForTimeout(300);
  check('Affichage : conservé après rechargement', /theme-dark/.test(await page.evaluate(() => document.documentElement.className)));
  check('Aucune erreur JavaScript (équipe)', errs.length === 0, errs.join(' | '));
  results.forEach(r => console.log(r[0], r[1], r[2] ? '→ ' + r[2] : '')); console.log(`\n${results.filter(r => r[0] === 'OK ').length}/${results.length} vérifications réussies`);
  await b.close(); srv.close();
});
