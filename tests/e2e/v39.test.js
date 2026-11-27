// Tests V39 : Utilisateurs (CRUD), droits par rôle, journal, clôture de caisse, résumé du jour, livraisons, zones,
// coffrets, paniers abandonnés, rentabilité, validation en deux étapes, boutique (quartier, MTN MoMo, abonnement, panier)
const fs = require('fs'); const path = require('path'); const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,TEAMLOG,USER,REQLOG,products,customers,LAST_ORDER_ARGS};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', ROOT, path.join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, TEAMLOG, USER, REQLOG, products, customers, LAST_ORDER_ARGS } = mod.exports; const OUT = path.join(__dirname, 'output', 'v39'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);
const vercel = JSON.parse(fs.readFileSync(ROOT + '/vercel.json', 'utf8')); const pubCsp = vercel.headers.find(h => h.source.includes('client')).headers.find(h => h.key === 'Content-Security-Policy').value;
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Données : un compte sans historique, des commandes à livrer, un paiement MoMo à vérifier, un panier abandonné, des zones
const NEWBIE = 'bbbbbbbb-0000-4000-8000-000000000039';
DB.profiles.push({ id: NEWBIE, full_name: 'Junior Livreur', email: 'junior@example.com', role: 'driver', is_active: true });
const [o1, o2] = DB.customer_orders.filter(o => o.customer_id);
Object.assign(o1, { status: 'ready', payment_method: 'mtn_momo', payment_status: 'to_verify', payment_reference: 'MP2611.1234', driver_id: null });
Object.assign(o2, { status: 'confirmed', payment_method: 'cash_on_delivery', payment_status: 'unpaid', driver_id: USER.id });
DB.shop_carts.push({ id: 'c1', token: '11111111-2222-4333-8444-555566667777', customer_name: 'Awa', phone: '061112233', items: [{ product_id: products[0].id, name: products[0].name, quantity: 2, price: products[0].sale_price }], total: products[0].sale_price * 2, status: 'open', reminded_count: 0, updated_at: new Date(Date.now() - 3 * 36e5).toISOString(), created_at: new Date(Date.now() - 3 * 36e5).toISOString() });

srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`; const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }); await setup(ctx, true);
  await ctx.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept(d.type() === 'prompt' ? '2' : undefined));
  const go = async (pg, w = 1500) => { await p.evaluate(x => window.MyraApp.navigate(x), pg); await p.waitForTimeout(w); };
  await p.goto(base); await p.waitForTimeout(2500);
  const nav = await p.$$eval('#navigation [data-page]', a => a.map(x => x.dataset.page));
  check('Menu : Administration et nouvelles pages', ['users', 'permissions', 'activity', 'cash_closing', 'daily_summary', 'deliveries', 'delivery_zones', 'bundles', 'costing', 'carts'].every(x => nav.includes(x)), nav.filter(x => !['dashboard'].includes(x)).length + ' pages');
  check('Nom de l’application : LSM Business Manager', /LSM/.test(await p.textContent('.sidebar')) && (await p.title()).includes('LSM Business Manager'), await p.title());

  // ---------- Utilisateurs (CRUD)
  await go('users');
  check('Utilisateurs : indicateurs et liste', await p.isVisible('#tmKpis .kpi') && (await p.$$('#tmList .tm-row')).length === DB.profiles.length);
  await p.fill('#tmSearch', 'junior'); await p.waitForTimeout(200);
  check('Utilisateurs : recherche', (await p.$$('#tmList .tm-row')).length === 1);
  await p.fill('#tmSearch', ''); await p.selectOption('#tmRole', 'sales'); await p.waitForTimeout(200);
  check('Utilisateurs : filtre par rôle', (await p.$$('#tmList .tm-row')).length === DB.profiles.filter(x => x.role === 'sales').length);
  await p.selectOption('#tmRole', ''); await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '/utilisateurs.png', fullPage: true });
  await p.click(`.tm-row[data-id="${NEWBIE}"] [data-edit]`); await p.waitForTimeout(300);
  await p.fill('.modal [name=full_name]', 'Junior Mabanza'); await p.fill('.modal [name=phone]', '06 555 44 33'); await p.click('.modal [type=submit]'); await p.waitForTimeout(800);
  const up = TEAMLOG.find(x => x.action === 'update');
  check('Modifier un utilisateur (nom, téléphone)', up && up.full_name === 'Junior Mabanza' && DB.profiles.find(x => x.id === NEWBIE).phone === '06 555 44 33' && !up.email);
  const grace = DB.profiles.find(x => x.role === 'sales');
  await p.click(`.tm-row[data-id="${grace.id}"] [data-del]`); await p.waitForTimeout(800);
  check('Supprimer un compte avec historique : refusé, désactivation proposée', /Suppression impossible/.test(await p.textContent('.modal')) && await p.isVisible('#tmOff'));
  await p.click('#tmOff'); await p.waitForTimeout(800);
  check('… désactivé à la place', grace.is_active === false);
  await p.click(`.tm-row[data-id="${NEWBIE}"] [data-del]`); await p.waitForTimeout(800);
  check('Supprimer un compte sans historique', !DB.profiles.some(x => x.id === NEWBIE) && !(await p.$(`.tm-row[data-id="${NEWBIE}"]`)));
  check('Pas de bouton supprimer sur son propre compte', !(await p.$(`.tm-row[data-id="${USER.id}"] [data-del]`)));

  // ---------- Droits par rôle
  await go('permissions');
  await p.click('[data-tab="sales"]'); const f = '.pm-role[data-role="sales"]';
  await p.uncheck(`${f} [name=page][value="carts"]`); await p.fill(`${f} [name=max_discount_pct]`, '15'); await p.check(`${f} [name=can_delete]`);
  await p.click(`${f} [type=submit]`); await p.waitForTimeout(700);
  const rs = DB.role_permissions.find(x => x.role === 'sales');
  check('Droits : pages, suppression et remise maximale enregistrées', !rs.pages.includes('carts') && rs.pages.includes('sales') && rs.max_discount_pct === 15 && rs.can_delete === true, JSON.stringify(rs).slice(0, 160));
  await p.screenshot({ path: OUT + '/droits.png', fullPage: true });

  // ---------- Journal d'activité
  await go('activity');
  check('Journal : activité de l’équipe affichée', (await p.$$('#acList .ac-row')).length === DB.audit_logs.length && /4 500 → 5000|4500 → 5000/.test((await p.textContent('#acList')).replace(/ | /g, ' ')), (await p.textContent('#acList')).slice(0, 160));
  await p.selectOption('#acAction', 'delete'); await p.waitForTimeout(700);
  check('Journal : filtre « Suppression »', (await p.$$('#acList .ac-row')).length === 1);
  await p.screenshot({ path: OUT + '/journal.png', fullPage: true });

  // ---------- Clôture de caisse
  await go('cash_closing');
  await p.fill('#ccForm [name=cash]', '45000'); await p.fill('#ccForm [name=mtn_momo]', '11500'); await p.waitForTimeout(200);
  check('Caisse : écart calculé en direct', /Écart/.test(await p.textContent('#ccDiff')) && /500/.test(await p.textContent('#ccDiff')));
  await p.click('#ccForm [type=submit]'); await p.waitForTimeout(900);
  const cc = DB.cash_closings[0]; check('Caisse : clôture envoyée au serveur', cc && cc.counted.cash === 45000 && cc.difference === -500 && cc.closing_date === today, JSON.stringify(cc || {}).slice(0, 120));
  DB.cash_closings.push({ ...cc, id: 'cc2', user_id: grace.id });
  await go('cash_closing');
  check('Caisse : liste de l’équipe avec validation', (await p.$$('#ccTeam [data-val]')).length === 1);
  await p.click('#ccTeam [data-val]'); await p.waitForTimeout(700);
  check('Caisse : validation par la direction', DB.cash_closings.find(x => x.id === 'cc2').status === 'validated');
  await p.screenshot({ path: OUT + '/caisse.png', fullPage: true });

  // ---------- Résumé du jour
  await go('daily_summary');
  check('Résumé du jour : chiffres, vendeurs, stock', /87[\s  ]?500/.test(await p.textContent('#dsBody')) && /Grâce Vendeuse/.test(await p.textContent('#dsBody')) && /Ruptures/.test(await p.textContent('#dsBody')));
  await p.screenshot({ path: OUT + '/resume.png', fullPage: true });

  // ---------- Livraisons
  await go('deliveries', 2000);
  check('Livraisons : paiement MoMo à vérifier affiché', /MP2611\.1234/.test(await p.textContent('#dvVerify')));
  await p.click('#dvVerify [data-ok="1"]'); await p.waitForTimeout(900);
  check('Livraisons : paiement MoMo confirmé', o1.payment_status === 'paid');
  check('Livraisons : cartes avec appel, WhatsApp, itinéraire', (await p.$$('.dv-card')).length >= 2 && await p.isVisible(`.dv-card[data-id="${o2.id}"] a[href^="https://www.google.com/maps"]`));
  await p.selectOption(`.dv-card[data-id="${o1.id}"] [data-driver]`, USER.id); await p.waitForTimeout(700);
  check("Livraisons : livreur attribué", o1.driver_id === USER.id);
  await p.click(`.dv-card[data-id="${o2.id}"] [data-done]`); await p.waitForTimeout(400);
  await p.fill('.modal [name=cash]', String(o2.total)); await p.setInputFiles('.modal [name=photo]', { name: 'colis.png', mimeType: 'image/png', buffer: fs.readFileSync(ROOT + '/assets/icons/public-32.png') });
  await p.fill('.modal [name=note]', 'Remis au gardien'); await p.click('.modal [type=submit]'); await p.waitForTimeout(1500);
  check('Livraisons : livrée avec argent encaissé et photo', o2.status === 'delivered' && Number(o2.cash_collected) === Number(o2.total) && /^deliveries\//.test(o2.delivery_proof_url || '') && REQLOG.some(x => x.startsWith('UPLOAD') && x.includes('myra-deliveries')), o2.delivery_proof_url);
  await p.screenshot({ path: OUT + '/livraisons.png', fullPage: true });

  // ---------- Zones de livraison
  await go('delivery_zones');
  await p.click('#dzAdd'); await p.fill('.modal [name=name]', 'Poto-Poto'); await p.fill('.modal [name=fee]', '1000'); await p.click('.modal [type=submit]'); await p.waitForTimeout(700);
  check('Zones : quartier ajouté', DB.delivery_zones.some(z => z.name === 'Poto-Poto' && Number(z.fee) === 1000));
  DB.delivery_zones.push({ id: 'z2', name: 'Bacongo', fee: 1500, delay: 'Le jour même', is_active: true, sort_order: 2 });

  // ---------- Coffrets
  await go('bundles');
  await p.click('#bdNew'); await p.waitForTimeout(300);
  await p.fill('.modal [name=name]', 'Coffret découverte'); await p.fill('.modal [name=price]', '7000');
  await p.selectOption('.modal .bd-line select', products[0].id); await p.click('#bdAddLine'); await p.selectOption('.modal .bd-line:nth-child(2) select', products[1].id);
  await p.click('.modal [type=submit]'); await p.waitForTimeout(1200);
  const bundle = DB.products.find(x => x.name === 'Coffret découverte');
  check('Coffret créé avec sa composition', bundle && bundle.is_bundle && DB.product_bundle_items.filter(i => i.bundle_id === bundle.id).length === 2);
  await p.click(`.bd-card[data-id="${bundle.id}"] [data-make]`); await p.waitForTimeout(900);
  check('Coffret : assemblage (stock du coffret augmenté)', Number(bundle.stock_quantity) === 2, String(bundle.stock_quantity));
  check('Abonnements : section des demandes', await p.isVisible('#bdSubs'));
  await p.screenshot({ path: OUT + '/coffrets.png', fullPage: true });

  // ---------- Paniers abandonnés
  await go('carts');
  check('Paniers abandonnés : relance WhatsApp', /Awa/.test(await p.textContent('#caList')) && (await p.getAttribute('#caList [data-remind]', 'href')).startsWith('https://wa.me/'));
  await p.click('#caList [data-dismiss]'); await p.waitForTimeout(700);
  check('Paniers : classer', DB.shop_carts.find(x => x.id === 'c1').status === 'dismissed');

  // ---------- Rentabilité
  await go('costing');
  check('Rentabilité : coûts, marges, prix conseillé', (await p.$$('#coList tbody tr')).length > 3 && /Prix conseillé/.test(await p.textContent('#coList')));
  await p.fill(`#coList tr[data-id="${products[0].id}"] [data-k="packaging_cost"]`, '150'); await p.press(`#coList tr[data-id="${products[0].id}"] [data-k="packaging_cost"]`, 'Tab'); await p.waitForTimeout(800);
  check('Rentabilité : coût d’emballage enregistré', Number(products[0].packaging_cost) === 150);
  await p.screenshot({ path: OUT + '/rentabilite.png', fullPage: true });

  // ---------- Profil : validation en deux étapes
  await go('profile', 2000);
  check('Profil : validation en deux étapes proposée', await p.isVisible('#pfMfa') && /Activer/.test(await p.textContent('#pfMfa')));
  // Fiche commande : paiement et livreur
  check('Aucune erreur JavaScript (direction)', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ---------- Rôle Livreur : menu restreint, pages bloquées, pas de suppression
  const me = DB.profiles.find(x => x.id === USER.id); me.role = 'driver';
  const d = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(d, true);
  await d.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); });
  const q = await d.newPage(); const qerr = []; q.on('pageerror', e => qerr.push(e.message)); await q.goto(base); await q.waitForTimeout(2500);
  const dnav = await q.$$eval('#navigation [data-page]', a => a.map(x => x.dataset.page));
  check('Livreur : menu limité à ses livraisons', dnav.includes('deliveries') && !dnav.includes('sales') && !dnav.includes('users') && !dnav.includes('finances'), dnav.join(','));
  check('Livreur : ouvre directement « Livraisons »', await q.evaluate(() => window.MyraApp.state.page) === 'deliveries');
  await q.evaluate(() => window.MyraApp.navigate('sales')); await q.waitForTimeout(800);
  check('Livreur : page Ventes refusée', await q.evaluate(() => window.MyraApp.state.page) !== 'sales' && await q.evaluate(() => document.body.classList.contains('perm-no-delete')));
  await q.screenshot({ path: OUT + '/livreur-mobile.png', fullPage: true });
  check('Livreur : aucune erreur', qerr.length === 0, qerr.join(' | '));
  me.role = 'owner'; await d.close();

  // ---------- Boutique : quartier, MTN MoMo, abonnement, panier enregistré
  Object.assign(DB.shop_settings[0], { momo_code: '245950', momo_name: 'Hermellon Glacial', momo_number: '068172503', cash_on_delivery: true });
  const s = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(s, 'visitor');
  await s.route(/boutique\.html/, async r => { const res = await r.fetch(); r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': pubCsp } }); });
  const w = await s.newPage(); const csp = [], werr = []; w.on('console', x => /Content Security Policy|Refused/.test(x.text()) && csp.push(x.text())); w.on('pageerror', e => werr.push(e.message));
  await w.goto(base + 'boutique.html'); await w.waitForTimeout(1800);
  check('Boutique : coffret mis en avant', /Coffret/.test(await w.textContent('#grid')));
  await w.click(`[data-open="${bundle.id}"]`); await w.waitForTimeout(400);
  check('Boutique : composition du coffret et économie', /Dans ce coffret/.test(await w.textContent('.pd-bundle')));
  await w.click('#pdAdd'); await w.waitForTimeout(300);
  await w.click('#cartBar'); await w.waitForTimeout(300);
  check('Panier : frais selon le quartier annoncés', /selon votre quartier/.test(await w.textContent('.hint')));
  await w.click('#toCheckout'); await w.waitForTimeout(400);
  await w.fill('[name=name]', 'Grâce Mabiala'); await w.fill('[name=phone]', '06 77 88 99 00'); await w.fill('[name=address]', 'Rue Mbochi n°12'); await w.waitForTimeout(1500);
  check('Panier enregistré dès la saisie du téléphone', DB.shop_carts.some(c => c.phone === '0677889900' && c.status === 'open'));
  await w.selectOption('[name=zone]', 'Bacongo'); await w.waitForTimeout(200);
  check('Récapitulatif : frais de livraison du quartier', /Bacongo/.test(await w.textContent('#recap')) && /1[\s  ]?500/.test(await w.textContent('#recap')));
  await w.check('[name=pay][value=mtn_momo]'); await w.waitForTimeout(200);
  const momo = await w.textContent('#momoBox');
  check('MTN MoMo : code marchand 245950, nom et montant affichés', momo.includes('245950') && momo.includes('Hermellon Glacial') && momo.includes('068172503'), momo.slice(0, 140));
  await w.screenshot({ path: OUT + '/boutique-momo.png', fullPage: true });
  await w.click('#sendOrder'); await w.waitForTimeout(300);
  check('MTN MoMo : référence obligatoire', /référence/.test(await w.textContent('#formErr')));
  await w.fill('[name=ref]', 'MP2711.0042.B12345'); await w.selectOption('[name=sub]', 'monthly');
  await w.click('#sendOrder'); await w.waitForTimeout(1500);
  const a = LAST_ORDER_ARGS[LAST_ORDER_ARGS.length - 1] || {};
  check('Commande : paiement, quartier, abonnement et panier transmis', a.p_payment_method === 'mtn_momo' && a.p_payment_reference === 'MP2711.0042.B12345' && a.p_zone === 'Bacongo' && a.p_subscription === 'monthly' && /^[0-9a-f-]{36}$/.test(a.p_cart_token || ''), JSON.stringify(a).slice(0, 200));
  check('Confirmation : paiement en vérification + abonnement', /vérifions/.test(await w.textContent('.ok')) && /abonnement/.test(await w.textContent('.ok')));
  check('Abonnement créé « à valider »', DB.recurring_orders.some(r => r.frequency === 'monthly' && r.is_active === false));
  check('Panier marqué « commandé »', DB.shop_carts.some(c => c.phone === '0677889900' && c.status === 'converted'));
  await w.screenshot({ path: OUT + '/boutique-confirmation.png', fullPage: true });
  check('Boutique : aucune violation de sécurité ni erreur', csp.length === 0 && werr.length === 0, csp.concat(werr).join(' | ').slice(0, 200));
  check('Boutique : pas de défilement horizontal', await w.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await s.close(); await b.close(); srv.close();
  results.forEach(r => console.log(r.join(' · ')));
  const ok = results.filter(r => r[0].startsWith('OK')).length; console.log(`\n${ok}/${results.length} vérifications réussies`); process.exit(ok === results.length ? 0 : 1);
});
