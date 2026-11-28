// Tests V41 : trésorerie, bénéfice réel, sauvegardes, caisse rapide, partage de documents (WhatsApp, SMS…), reçu en ligne,
// retours, planning de production, catégories de dépenses, sons, boutique (MoMo automatique, catalogue réseaux sociaux)
const fs = require('fs'); const path = require('path'); const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,USER,products,customers,sales,POS_LOG,PLAN_LOG,MOMO_LOG,LAST_ORDER_ARGS};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', ROOT, path.join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, USER, products, customers, sales, POS_LOG, PLAN_LOG, MOMO_LOG, LAST_ORDER_ARGS } = mod.exports; const OUT = path.join(__dirname, 'output', 'v41'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);
const vercel = JSON.parse(fs.readFileSync(ROOT + '/vercel.json', 'utf8'));
const cspFor = f => vercel.headers.filter(h => new RegExp('^' + h.source + '$').test('/' + f)).map(h => h.headers.find(x => x.key === 'Content-Security-Policy')).filter(Boolean).pop().value;

srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`; const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }); await setup(ctx, true);
  await ctx.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const go = async (pg, w = 1500) => { await p.evaluate(x => window.MyraApp.navigate(x), pg); await p.waitForTimeout(w); };
  await p.goto(base); await p.waitForTimeout(2500);
  const nav = await p.$$eval('#navigation [data-page]', a => a.map(x => x.dataset.page));
  check('Menu : trésorerie, bénéfice, sauvegardes, caisse rapide, retours, planning', ['treasury', 'profit', 'backups', 'pos', 'returns', 'production_plan'].every(x => nav.includes(x)));

  // ---------- 1. Trésorerie
  await go('treasury');
  check('Trésorerie : comptes et total', (await p.$$('.tr-acc')).length >= 3 && /Trésorerie totale/.test(await p.textContent('#trKpis')));
  const cash = DB.cash_accounts.find(a => a.name === 'Caisse principale'); const bal0 = Number(cash.current_balance);
  await p.click(`.tr-acc[data-id="${cash.id}"] [data-act="contribution"]`); await p.waitForTimeout(300);
  await p.fill('.modal [name=amount]', '20000'); await p.fill('.modal [name=note]', 'Fonds de départ'); await p.click('.modal [type=submit]'); await p.waitForTimeout(1000);
  check('Apport : solde augmenté et mouvement créé', Number(cash.current_balance) === bal0 + 20000 && DB.cash_transactions.some(t => t.source_type === 'contribution' && /Fonds de départ/.test(t.description)));
  const momo = DB.cash_accounts.find(a => a.provider === 'MTN'); const m0 = Number(momo.current_balance);
  await p.click(`.tr-acc[data-id="${cash.id}"] [data-act="transfer"]`); await p.waitForTimeout(300);
  await p.selectOption('.modal [name=to]', momo.id); await p.fill('.modal [name=amount]', '5000'); await p.click('.modal [type=submit]'); await p.waitForTimeout(1000);
  check('Transfert espèces → MTN MoMo', Number(momo.current_balance) === m0 + 5000 && Number(cash.current_balance) === bal0 + 15000);
  await p.click(`.tr-acc[data-id="${cash.id}"] [data-act="reconcile"]`); await p.waitForTimeout(300);
  await p.fill('.modal [name=actual]', String(bal0 + 14000)); await p.waitForTimeout(150);
  check('Rapprochement : écart affiché avant validation', /Écart/.test(await p.textContent('#rcDiff')));
  await p.click('.modal [type=submit]'); await p.waitForTimeout(1000);
  check('Rapprochement : solde = argent réellement compté', Number(cash.current_balance) === bal0 + 14000);
  const nTx = DB.cash_transactions.length; await p.click('#trList [data-cancel] >> nth=0'); await p.waitForTimeout(1000);
  check('Annuler un mouvement', DB.cash_transactions.length < nTx);
  await p.screenshot({ path: OUT + '/tresorerie.png', fullPage: true });

  // ---------- 2. Bénéfice réel
  await go('profit');
  check('Bénéfice : ventes, coût, dépenses, bénéfice net', /Bénéfice net/.test(await p.textContent('#pfBody')) && (await p.$$('.pf-chart .pf-m')).length === 3 && /Loyer & charges/.test(await p.textContent('#pfBody')));
  await p.click('.pf-m >> nth=0'); await p.waitForTimeout(800);
  check('Bénéfice : détail d’un autre mois', /septembre 2026/.test(await p.textContent('#pfBody')));
  await p.screenshot({ path: OUT + '/benefice.png', fullPage: true });

  // ---------- 9. Sauvegardes
  await go('backups');
  check('Sauvegardes : liste (automatique de la nuit)', (await p.$$('#bkList [data-id]')).length >= 1 && /Automatique/.test(await p.textContent('#bkList')));
  await p.click('#bkNow'); await p.waitForTimeout(800);
  check('Sauvegarder maintenant', DB.backups.length >= 2 && DB.backups[0].kind === 'manual');
  await p.click('#bkList [data-restore] >> nth=0'); await p.waitForTimeout(300); await p.selectOption('.modal [name=t]', 'customers'); await p.click('.modal [type=submit]'); await p.waitForTimeout(800);
  check('Restaurer une table (propriétaire)', PLAN_LOG.some(x => x[0] === 'restore' && x[1] === 'customers'));

  // ---------- 3. Caisse rapide
  await go('pos', 1800);
  const prod = products.find(x => x.is_active !== false && x.sale_price > 0 && x.stock_quantity > 3); const st0 = prod.stock_quantity;
  await p.click(`.pos-p[data-id="${prod.id}"]`); await p.click(`.pos-p[data-id="${prod.id}"]`); await p.waitForTimeout(200);
  check('Caisse rapide : ajout en un clic, total', (await p.textContent('#posTotal')).replace(/\D/g, '') === String(prod.sale_price * 2));
  await p.fill('#posRecv', String(prod.sale_price * 2 + 1000)); await p.waitForTimeout(150);
  check('Caisse rapide : monnaie à rendre', /Monnaie à rendre/.test(await p.textContent('#posChange')) && /1[\s  ]?000/.test(await p.textContent('#posChange')));
  await p.screenshot({ path: OUT + '/caisse-rapide.png', fullPage: true });
  await p.click('#posGo'); await p.waitForTimeout(1200);
  const sale = sales[0];
  check('Caisse rapide : vente confirmée, encaissée, stock déduit', POS_LOG.length === 1 && prod.stock_quantity === st0 - 2 && sale.status === 'paid' && /Monnaie à rendre/.test(await p.textContent('.modal')));
  // Reçu WhatsApp / autres applications
  await p.click('#pdWa'); await p.waitForTimeout(400);
  const wa = await p.getAttribute('#mdSharePanel a[href*="wa.me"]', 'href');
  check('Reçu : partage WhatsApp avec lien du reçu en ligne', decodeURIComponent(wa).includes('recu.html?t=' + sale.receipt_token));
  check('Reçu : SMS, e-mail, Telegram, Facebook, copier le lien', await p.isVisible('#mdSharePanel a[href^="sms:"]') && await p.isVisible('#mdSharePanel a[href^="mailto:"]') && await p.isVisible('#mdSharePanel a[href*="t.me"]') && await p.isVisible('#mdSharePanel [data-copy]'));
  await p.click('#mdSharePanel [data-close]');
  // Ticket PDF puis « Partager » le document
  await p.click('#pdPdf'); await p.waitForTimeout(1200);
  const fr = p.frames().find(f => f !== p.mainFrame() && f.url() === 'about:blank');
  check('Document : bouton « Partager » dans l’aperçu', !!fr && await fr.isVisible('#mdShare'));
  await fr.click('#mdShare'); await p.waitForTimeout(1200);
  const doc = DB.shared_documents[DB.shared_documents.length - 1];
  check('Document partagé : copie propre (sans barre d’outils)', doc && /Ticket/.test(doc.title) && !doc.html.includes('id="mdShare"') && doc.html.includes(prod.name));
  const waDoc = await fr.getAttribute('#mdSharePanel a[href*="wa.me"]', 'href');
  check('Document : lien sécurisé envoyé par WhatsApp', decodeURIComponent(waDoc).includes('document.html?t=' + doc.token));
  await p.screenshot({ path: OUT + '/partage.png' });
  await fr.click('#mdSharePanel [data-close]'); await fr.click('#mdClose'); await p.waitForTimeout(300); await p.click('.modal [data-close]').catch(() => {});

  // ---------- 6. Retours
  await go('returns');
  await p.click('#rtNew'); await p.fill('.modal [name=n]', sale.sale_number); await p.click('.modal [type=submit]'); await p.waitForTimeout(800);
  await p.fill(`.modal [data-pid="${prod.id}"]`, '1'); await p.waitForTimeout(150);
  check('Retour : remboursement proposé automatiquement', Number(await p.inputValue('.modal [name=refund]')) === prod.sale_price);
  const cashBefore = Number(cash.current_balance);
  await p.click('.modal [type=submit]'); await p.waitForTimeout(1500);
  check('Retour : enregistré, remis en stock, remboursé depuis la caisse', DB.sale_returns.length === 1 && prod.stock_quantity === st0 - 1 && Number(cash.current_balance) === cashBefore - prod.sale_price);
  const fr2 = p.frames().find(f => f !== p.mainFrame() && f.url() === 'about:blank');
  await fr2?.waitForSelector('.paper', { timeout: 5000 }).catch(() => {});
  check('Retour : avoir imprimable (et partageable)', !!fr2 && /Avoir|Produits retournés/.test(await fr2.textContent('body')) && await fr2.isVisible('#mdShare'));
  await fr2?.click('#mdClose'); await p.waitForTimeout(300);
  await go('returns'); check('Retours : liste et motifs', /Pot|abîmé|Produit/.test(await p.textContent('#rtWhy')) && (await p.$$('#rtList [data-id]')).length === 1);

  // ---------- 4. Planning de production
  await go('production_plan');
  check('Planning : produits à produire et matières à acheter', (await p.$$('#ppBody tr[data-id]')).length === 4 && /Gingembre/.test(await p.textContent('#ppBody')));
  await p.click('#ppBatches'); await p.waitForTimeout(700); await p.click('#ppPO'); await p.waitForTimeout(700);
  check('Planning : lots et bons de commande créés', PLAN_LOG.some(x => x[0] === 'batches' && x[1].length === 2) && PLAN_LOG.some(x => x[0] === 'po' && x[1][0].quantity === 2));
  await p.screenshot({ path: OUT + '/planning.png', fullPage: true });

  // ---------- Dépenses : catégorie et compte
  await go('expenses'); await p.click('#addBtn'); await p.waitForTimeout(800);
  check('Dépense : catégorie et compte de paiement dans le formulaire', !!(await p.$('[name=category_id]')) && !!(await p.$('[name=cash_account_id]')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.evaluate(() => { const r = document.getElementById('modalRoot'); if (r) r.innerHTML = ''; });

  // ---------- Fiche vente : reçu et retour
  await p.evaluate(id => window.MyraApp.openSaleDetail(id), sale.id); await p.waitForTimeout(1200);
  check('Fiche vente : boutons « Reçu / Partager » et « Retour »', await p.isVisible('#sdShare') && await p.isVisible('#sdReturn'));
  await p.click('#sdShare'); await p.waitForTimeout(400);
  check('Fiche vente : reçu partagé par lien', decodeURIComponent(await p.getAttribute('#mdSharePanel a[href*="wa.me"]', 'href')).includes('recu.html?t='));
  await p.click('#mdSharePanel [data-close]'); await p.evaluate(() => { document.getElementById('modalRoot').innerHTML = ''; });

  // ---------- 8. Sons
  await go('notifications');
  check('Notifications : réglage du son et test', await p.isVisible('#sndOn') && await p.isVisible('#sndTest') && await p.evaluate(() => typeof window.MyraSound?.play === 'function'));
  await p.click('#sndTest');

  // ---------- 5 / 7 / 10. Réglages boutique
  await go('shop');
  check('Boutique : catalogue Facebook/Instagram/WhatsApp, reçus, MoMo automatique', /catalogue-facebook\.csv/.test(await p.textContent('#shopPlus')) && await p.isVisible('#rcMode') && await p.isVisible('#momoApi'));
  await p.screenshot({ path: OUT + '/reglages-boutique.png', fullPage: true });
  check('Aucune erreur JavaScript (application)', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ---------- Pages publiques : document partagé et reçu (sécurité stricte)
  const m = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(m, 'visitor');
  await m.route(/\/(document|recu|boutique)\.html/, async r => { const res = await r.fetch(); const f = new URL(r.request().url()).pathname.slice(1); r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': cspFor(f) } }); });
  const q = await m.newPage(); const csp = [], qerr = []; q.on('console', x => /Content Security Policy|Refused/.test(x.text()) && csp.push(x.text())); q.on('pageerror', e => qerr.push(e.message));
  await q.goto(base + 'document.html?t=' + doc.token); await q.waitForTimeout(1800);
  const inner = q.frames().find(f => f !== q.mainFrame());
  check('document.html : document affiché (sans script)', !!inner && (await inner.textContent('body')).includes(prod.name) && await q.isVisible('#docPrint'));
  await q.screenshot({ path: OUT + '/document-mobile.png', fullPage: true });
  await q.goto(base + 'document.html?t=' + 'f'.repeat(64)); await q.waitForTimeout(1200);
  check('document.html : lien invalide → message clair', /expiré|introuvable/.test(await q.textContent('#docState')));
  await q.goto(base + 'recu.html?t=' + sale.receipt_token); await q.waitForTimeout(1500);
  check('recu.html : reçu en ligne avec total et paiement', /Merci pour votre achat/.test(await q.textContent('#rcApp')) && (await q.textContent('#rcApp')).includes(prod.name));
  await q.screenshot({ path: OUT + '/recu-mobile.png', fullPage: true });
  check('Pages publiques : aucune violation de sécurité ni erreur', csp.length === 0 && qerr.length === 0, csp.concat(qerr).join(' | ').slice(0, 300));

  // ---------- 10. Boutique : paiement MTN MoMo validé automatiquement
  Object.assign(DB.shop_settings[0], { momo_code: '245950', momo_name: 'Hermellon Glacial', momo_api_enabled: true });
  await q.goto(base + 'boutique.html'); await q.waitForTimeout(1800);
  const bp = products.find(x => x.is_active !== false && x.sale_price > 0 && x.stock_quantity > 0);
  await q.click(`[data-open="${bp.id}"]`); await q.waitForTimeout(300); await q.click('#pdAdd'); await q.waitForTimeout(200);
  await q.click('#cartBar'); await q.waitForTimeout(300); await q.click('#toCheckout'); await q.waitForTimeout(400);
  await q.fill('[name=name]', 'Awa Nkounkou'); await q.fill('[name=phone]', '06 111 22 33'); await q.fill('[name=address]', 'Rue 12');
  await q.check('[name=pay][value=mtn_momo]'); await q.waitForTimeout(200);
  check('Boutique : choix « demande de paiement sur mon téléphone »', await q.isVisible('[name=momomode][value=api]') && await q.isChecked('[name=momomode][value=api]'));
  await q.fill('#momoBox [name=payer]', '06 111 22 33'); await q.click('#sendOrder'); await q.waitForTimeout(11000);
  check('Boutique : demande MoMo envoyée puis paiement confirmé automatiquement', MOMO_LOG.some(x => x.action === 'request' && x.payer === '06 111 22 33') && /Paiement MTN MoMo reçu/.test(await q.textContent('.ok')), MOMO_LOG.map(x => x.action).join(','));
  check('Commande : référence technique (aucune saisie demandée au client)', /^APP[0-9A-F]{10}$/.test(LAST_ORDER_ARGS[LAST_ORDER_ARGS.length - 1]?.p_payment_reference || ''));
  await q.screenshot({ path: OUT + '/boutique-momo-auto.png', fullPage: true });
  check('Boutique : aucune erreur', qerr.length === 0, qerr.join(' | '));
  await m.close();

  // ---------- Caisse rapide sur téléphone
  const t = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(t, true);
  await t.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); });
  const tp = await t.newPage(); await tp.goto(base); await tp.waitForTimeout(2500); await tp.evaluate(() => window.MyraApp.navigate('pos')); await tp.waitForTimeout(1500);
  check('Caisse rapide (téléphone) : utilisable, sans défilement horizontal', await tp.isVisible('.pos-p') && await tp.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await tp.screenshot({ path: OUT + '/caisse-rapide-mobile.png', fullPage: true });
  await t.close(); await b.close(); srv.close();
  results.forEach(r => console.log(r.join(' · ')));
  const ok = results.filter(r => r[0].startsWith('OK')).length; console.log(`\n${ok}/${results.length} vérifications réussies`); process.exit(ok === results.length ? 0 : 1);
});
