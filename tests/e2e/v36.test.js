// Tests V36 : centre de notifications, menu de l'avatar, profil, paramètres, réglages boutique, suivi de commande, pages publiques
const fs = require('fs'); const path = require('path'); const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,customers,products};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', ROOT, path.join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, customers, products } = mod.exports; const OUT = path.join(__dirname, 'output', 'v36'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);
const vercel = JSON.parse(fs.readFileSync(ROOT + '/vercel.json', 'utf8')); const pubCsp = vercel.headers.find(h => h.source.includes('client')).headers.find(h => h.key === 'Content-Security-Policy').value;

srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`; const b = await chromium.launch();
  // ---------- Équipe (ordinateur)
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' }); await setup(ctx, true);
  await ctx.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); localStorage.removeItem('myra_notif_view'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(base); await p.waitForTimeout(2500);
  const unread0 = DB.app_notifications.filter(n => !DB.app_notification_reads.some(r => r.notification_id === n.id)).length;
  check('Cloche : compteur = notifications non lues (et non plus les alertes)', (await p.textContent('#bellBadge')) === String(unread0), `${await p.textContent('#bellBadge')} / ${unread0}`);
  await p.click('#bellBtn'); await p.waitForTimeout(700);
  check('Panneau : toutes les notifications, non lues signalées', (await p.$$('#bellPanel .nc-item')).length === DB.app_notifications.length && (await p.$$('#bellPanel .nc-item.unread')).length === unread0);
  await p.screenshot({ path: OUT + '/cloche.png' });
  await p.click('#bellPanel [data-tab="read"]'); check('Onglet « Lues »', (await p.$$('#bellPanel .nc-item')).length === DB.app_notifications.length - unread0);
  await p.click('#bellPanel [data-tab="todo"]'); check('Onglet « À traiter » : alertes permanentes', (await p.$$('#bellPanel .nc-alert, #bellPanel .nc-empty')).length >= 1);
  await p.click('#bellPanel [data-tab="all"]'); await p.selectOption('#bellPanel [data-kind]', 'orders');
  check('Filtre par type (Commandes)', (await p.$$('#bellPanel .nc-item')).length === DB.app_notifications.filter(n => n.kind === 'orders').length);
  await p.selectOption('#bellPanel [data-kind]', ''); await p.selectOption('#bellPanel [data-sort]', 'old');
  const firstOld = await p.textContent('#bellPanel .nc-item b'); check('Tri « Plus anciennes »', firstOld.includes('Nouvelle commande') && firstOld.includes('📦'), firstOld);
  await p.selectOption('#bellPanel [data-sort]', 'new');
  const firstId = await p.getAttribute('#bellPanel .nc-item', 'data-id'); await p.click(`#bellPanel [data-toggle="${firstId}"]`); await p.waitForTimeout(400);
  check('Marquer une notification comme lue', DB.app_notification_reads.some(r => r.notification_id === firstId) && (await p.textContent('#bellBadge')) === String(unread0 - 1));
  await p.click(`#bellPanel [data-toggle="${firstId}"]`); await p.waitForTimeout(400);
  check('… puis comme non lue', !DB.app_notification_reads.some(r => r.notification_id === firstId) && (await p.textContent('#bellBadge')) === String(unread0));
  await p.click('#bellPanel [data-all]'); await p.waitForTimeout(500);
  check('Tout marquer comme lu : compteur masqué', !(await p.isVisible('#bellBadge')) && DB.app_notification_reads.length >= DB.app_notifications.length);
  await p.click('#bellPanel [data-page]'); await p.waitForTimeout(1500);
  check('Page Notifications : historique complet', (await p.$$('#ncHistory .nc-item')).length === DB.app_notifications.length);
  // Menu de l'avatar
  await p.click('#topAvatar'); await p.waitForTimeout(400);
  check('Menu de l’avatar : profil, paramètres, notifications, déconnexion', await p.isVisible('.am-menu') && (await p.$$('.am-menu [role=menuitem]')).length >= 7);
  await p.click('.am-menu [data-theme="dark"]'); await p.waitForTimeout(200);
  check('Menu : bascule en mode sombre', await p.evaluate(() => document.documentElement.classList.contains('theme-dark')));
  await p.click('.am-menu [data-theme="light"]'); await p.keyboard.press('Escape');
  // Profil
  await p.click('#topAvatar'); await p.click('.am-menu [data-go="profile"]'); await p.waitForTimeout(1800);
  check('Profil : activité du mois, sécurité, préférences', await p.isVisible('#pfKpis .kpi') && await p.isVisible('#pfPw') && /Préférences/.test(await p.textContent('.pf-more')));
  await p.fill('#pfPw [name=pw]', 'saveurs2026a'); await p.fill('#pfPw [name=pw2]', 'saveurs2026b'); await p.click('#pfPw [type=submit]'); await p.waitForTimeout(300);
  check('Profil : mots de passe différents refusés', /identiques/.test(await p.textContent('#toastRoot')));
  await p.screenshot({ path: OUT + '/profil.png', fullPage: true });
  // Paramètres
  await p.evaluate(() => window.MyraApp.navigate('settings')); await p.waitForTimeout(1500);
  await p.fill('#stCompany [name=phone]', '+242 06 999 00 00'); await p.click('#stCompany [type=submit]'); await p.waitForTimeout(700);
  check('Paramètres : coordonnées enregistrées', DB.company_settings[0].phone === '+242 06 999 00 00', DB.company_settings[0].phone);
  check('Paramètres : modules, données, application', (await p.$$('.st-tile')).length >= 8 && await p.isVisible('#stBackup') && await p.isVisible('#stUpdate'));
  await p.screenshot({ path: OUT + '/parametres.png', fullPage: true });
  // Réglages boutique
  await p.evaluate(() => window.MyraApp.navigate('shop')); await p.waitForTimeout(1500);
  await p.fill('[name=announcement]', 'Livraison offerte dès 20 000 FCFA'); await p.fill('[name=hours]', 'Lun–Sam 8 h–19 h'); await p.fill('[name=instagram_url]', 'https://instagram.com/saveursdemyra');
  await p.click('#shopForm [type=submit]'); await p.waitForTimeout(700);
  const ss = DB.shop_settings[0]; check('Boutique : annonce, horaires, Instagram enregistrés', ss.announcement === 'Livraison offerte dès 20 000 FCFA' && ss.hours === 'Lun–Sam 8 h–19 h' && ss.instagram_url === 'https://instagram.com/saveursdemyra');
  const vip = DB.promo_campaigns.find(x => x.code === 'VIP2000'); await p.click(`[data-promo="${vip.id}"]`); await p.waitForTimeout(500);
  check('Boutique : promotion affichée / masquée', vip.show_on_shop === true); await p.click(`[data-promo="${vip.id}"]`); await p.waitForTimeout(400);
  check('Aucune erreur JavaScript (équipe)', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ---------- Suivi de commande (téléphone, sécurité stricte)
  const order = DB.customer_orders.find(o => o.customer_id && customers.find(c => c.id === o.customer_id)?.phone);
  const cust = customers.find(c => c.id === order.customer_id);
  DB.customer_order_items.push({ id: 'x1', order_id: order.id, product_name: products[0].name, unit: products[0].unit, quantity: 2, unit_price: products[0].sale_price, line_total: 2 * products[0].sale_price });
  const m = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(m, 'visitor');
  await m.route(/\/(commande|avis|client)\.html/, async r => { const res = await r.fetch(); r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': pubCsp } }); });
  const q = await m.newPage(); const csp = [], qerr = []; q.on('console', x => /Content Security Policy|Refused/.test(x.text()) && csp.push(x.text())); q.on('pageerror', e => qerr.push(e.message));
  await q.goto(base + 'commande.html'); await q.waitForTimeout(1200);
  check('Suivi : en-tête et pied de page communs', await q.isVisible('header.top .brand') && await q.isVisible('footer.foot'));
  await q.fill('[name=number]', order.order_number); await q.fill('[name=phone]', '06 000 00 00'); await q.click('#trackForm [type=submit]'); await q.waitForTimeout(800);
  check('Suivi : mauvais téléphone refusé', /introuvable/.test(await q.textContent('#trackErr')));
  await q.fill('[name=phone]', cust.phone); await q.click('#trackForm [type=submit]'); await q.waitForTimeout(1000);
  const tx = await q.textContent('#result'); const nSteps = (await q.$$('.tl li')).length; check('Suivi : état, étapes, articles, montants', /Étape [1-6] sur 6/.test(tx) && nSteps === 6 && tx.includes(products[0].name) && /Total/.test(tx), `${nSteps} étapes · ${tx.replace(/\s+/g, ' ').slice(150, 420)}`);
  await q.screenshot({ path: OUT + '/suivi-mobile.png', fullPage: true });
  await q.goto(base + 'avis.html?t=' + 'c'.repeat(64)); await q.waitForTimeout(1500);
  check('Avis : même en-tête que la boutique', await q.isVisible('header.top .brand') && await q.isVisible('.rv-crit'));
  await q.screenshot({ path: OUT + '/avis-mobile.png', fullPage: true });
  await q.goto(base + 'client.html?t=' + 'a'.repeat(64)); await q.waitForTimeout(1500);
  check('Espace client : même en-tête que la boutique', await q.isVisible('header.top .brand') && /Reste à payer/.test(await q.textContent('#app')));
  await q.screenshot({ path: OUT + '/client-mobile.png', fullPage: true });
  check('Pages publiques : aucune violation de sécurité ni erreur', csp.length === 0 && qerr.length === 0, (csp.concat(qerr)).join(' | ').slice(0, 200));
  check('Pages publiques : pas de défilement horizontal', await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await m.close(); await b.close(); srv.close();
  results.forEach(r => console.log(r.join(' · ')));
  const ok = results.filter(r => r[0].startsWith('OK')).length; console.log(`\n${ok}/${results.length} vérifications réussies`); process.exit(ok === results.length ? 0 : 1);
});
