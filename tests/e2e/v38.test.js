// Tests V38 : Équipe et accès (Paramètres) — activer un compte en attente, changer un rôle, créer un compte, nouveau mot de passe
const fs = require('fs'); const path = require('path'); const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,TEAMLOG,USER};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', ROOT, path.join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, TEAMLOG, USER } = mod.exports; const OUT = path.join(__dirname, 'output', 'v38'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);
const PENDING = 'aaaaaaaa-0000-4000-8000-000000000038';
DB.profiles.push({ id: PENDING, full_name: 'Persidem Pandou', email: 'persidem@example.com', role: 'employee', is_active: false });

srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`; const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }); await setup(ctx, true);
  await ctx.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(base); await p.waitForTimeout(2500);
  await p.evaluate(() => window.MyraApp.navigate('settings')); await p.waitForTimeout(1800);
  check('Paramètres : rubrique « Équipe et accès » pour le propriétaire', await p.isVisible('#st-team') && await p.isVisible('[data-anchor="st-team"]'));
  check('Liste de l’équipe avec le compte en attente signalé', (await p.$$('#tmList .tm-row')).length === DB.profiles.length && await p.isVisible(`.tm-row.pending[data-id="${PENDING}"]`) && /1 compte en attente/.test(await p.textContent('#tmList')));
  check('Son propre compte non modifiable', !(await p.$(`.tm-row[data-id="${USER.id}"] [data-role]`)) && /\(vous\)/.test(await p.textContent(`.tm-row[data-id="${USER.id}"]`)));
  await (await p.$('#st-team')).screenshot({ path: OUT + '/equipe.png' });
  // Activer en Gérant
  await p.selectOption(`.tm-row[data-id="${PENDING}"] [data-role]`, 'manager'); await p.waitForTimeout(700);
  await p.click(`.tm-row[data-id="${PENDING}"] [data-active="1"]`); await p.waitForTimeout(800);
  const pe = DB.profiles.find(x => x.id === PENDING);
  check('Activer le compte en attente comme Gérant', pe.role === 'manager' && pe.is_active === true && !(await p.$('.tm-row.pending')), JSON.stringify(pe));
  // Désactiver un vendeur
  const sales = DB.profiles.find(x => x.role === 'sales');
  await p.click(`.tm-row[data-id="${sales.id}"] [data-active="0"]`); await p.waitForTimeout(800);
  check('Désactiver un membre', sales.is_active === false);
  // Créer un compte
  await p.click('#tmAdd'); await p.waitForTimeout(300);
  const pw = await p.inputValue('.modal [name=password]'); check('Mot de passe provisoire proposé (10 caractères)', pw.length === 10);
  await p.fill('.modal [name=full_name]', 'Awa Nkounkou'); await p.fill('.modal [name=email]', 'awa@example.com'); await p.selectOption('.modal [name=role]', 'stock_manager');
  await p.click('.modal [type=submit]'); await p.waitForTimeout(1000);
  const c = TEAMLOG.find(x => x.action === 'create');
  check('Création du compte via la fonction sécurisée', c && c.email === 'awa@example.com' && c.role === 'stock_manager' && c.password === pw && DB.profiles.some(x => x.email === 'awa@example.com'));
  check('Accès à transmettre affiché (e-mail + mot de passe)', /Accès à transmettre/.test(await p.textContent('.modal')) && (await p.textContent('.tm-cred')).includes(pw));
  await p.screenshot({ path: OUT + '/acces.png' });
  await p.click('.modal [data-close]'); await p.waitForTimeout(800);
  check('Nouveau membre dans la liste', /Awa Nkounkou/.test(await p.textContent('#tmList')));
  // E-mail déjà utilisé
  await p.click('#tmAdd'); await p.fill('.modal [name=full_name]', 'Doublon'); await p.fill('.modal [name=email]', 'awa@example.com'); await p.click('.modal [type=submit]'); await p.waitForTimeout(800);
  check('E-mail déjà utilisé : message clair', /existe déjà/.test(await p.textContent('#toastRoot')) && await p.isVisible('.modal'));
  await p.click('.modal [data-close]');
  // Nouveau mot de passe
  await p.click(`.tm-row[data-id="${PENDING}"] [data-pw]`); await p.waitForTimeout(800);
  const r = TEAMLOG.find(x => x.action === 'reset_password');
  check('Nouveau mot de passe provisoire', r && r.user_id === PENDING && r.password.length === 10 && (await p.textContent('.tm-cred')).includes(r.password));
  await p.click('.modal [data-close]');
  check('Aucune erreur JavaScript', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // Mobile
  const m = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(m, true);
  await m.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); });
  const q = await m.newPage(); await q.goto(base); await q.waitForTimeout(2500); await q.evaluate(() => window.MyraApp.navigate('settings')); await q.waitForTimeout(1500);
  await q.evaluate(() => document.getElementById('st-team').scrollIntoView());
  check('Mobile : liste lisible sans défilement horizontal', await q.isVisible('#st-team .tm-row') && await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await (await q.$('#st-team')).screenshot({ path: OUT + '/equipe-mobile.png' });
  await m.close();

  // Un vendeur ne voit pas la rubrique
  const v = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }); await setup(v, true);
  await v.addInitScript(() => { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); });
  DB.profiles.find(x => x.id === USER.id).role = 'sales';
  const s = await v.newPage(); await s.goto(base); await s.waitForTimeout(2500); await s.evaluate(() => window.MyraApp.navigate('settings')); await s.waitForTimeout(1500);
  check('Vendeur : pas de rubrique « Équipe et accès »', !(await s.$('#st-team')));
  DB.profiles.find(x => x.id === USER.id).role = 'owner';
  await v.close(); await b.close(); srv.close();
  results.forEach(r => console.log(r.join(' · ')));
  const ok = results.filter(r => r[0].startsWith('OK')).length; console.log(`\n${ok}/${results.length} vérifications réussies`); process.exit(ok === results.length ? 0 : 1);
});
