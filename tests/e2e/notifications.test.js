// Tests des notifications push (V33) avec le faux Supabase et un faux service de notifications du navigateur
const fs = require('fs'); const path = require('path'); const { chromium, devices } = require('playwright');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB,REQLOG};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', path.resolve(__dirname, '../..'), path.join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup, DB, REQLOG } = mod.exports; const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);
// Faux navigateur compatible notifications (l'état survit aux rechargements grâce à sessionStorage)
const fakePush = ({ perm = 'default', push = true } = {}) => {
  const S = { get: k => sessionStorage.getItem('fp_' + k), set: (k, v) => v == null ? sessionStorage.removeItem('fp_' + k) : sessionStorage.setItem('fp_' + k, v) };
  if (!S.get('perm')) S.set('perm', perm);
  window.Notification = class { static get permission() { return S.get('perm'); } static async requestPermission() { if (S.get('perm') === 'default') S.set('perm', 'granted'); return S.get('perm'); } };
  if (push) window.PushManager = function () {}; else delete window.PushManager;
  const mk = () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/appareil-test', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B' + 'x'.repeat(86), auth: 'authauthauthauth' } }; }, async unsubscribe() { S.set('sub', null); return true; } });
  const pm = { async getSubscription() { return S.get('sub') ? mk() : null; }, async subscribe(o) { window.__keyLen = o.applicationServerKey.length; window.__visible = o.userVisibleOnly; S.set('sub', '1'); return mk(); } };
  const reg = { pushManager: pm };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg), addEventListener() {}, controller: null } });
};
srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/`; const b = await chromium.launch();
  // ---- Ordinateur
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' }); await setup(ctx, true);
  await ctx.addInitScript(() => { try { localStorage.setItem('myra_v29_ready', '1'); } catch (_) {} });
  await ctx.addInitScript(fakePush, { perm: 'default' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base); await p.waitForTimeout(2500);
  check('Proposition d’activation au démarrage', await p.isVisible('#ntAsk'));
  await p.screenshot({ path: OUT + '/notif-proposition.png' });
  await p.click('#ntAsk [data-yes]'); await p.waitForTimeout(1200);
  check('Activation : appareil enregistré', DB.push_subscriptions.length === 1 && /Windows|Linux|Mac/.test(DB.push_subscriptions[0].device), JSON.stringify(DB.push_subscriptions[0] || {}).slice(0, 120));
  check('Clé publique demandée et notification de test envoyée', REQLOG.includes('FN myra-push public_key') && REQLOG.includes('FN myra-push test'));
  check('Abonnement « toujours visible » avec clé de 65 octets', await p.evaluate(() => window.__keyLen === 65 && window.__visible === true));
  await p.evaluate(() => window.MyraApp.navigate('notifications')); await p.waitForTimeout(1200);
  const txt = await p.textContent('#content, main');
  check('Écran : « Activées sur cet appareil » + 5 types', /Activées sur cet appareil/.test(txt) && (await p.$$('[data-pref]')).length === 5);
  await p.screenshot({ path: OUT + '/notif-ecran.png', fullPage: true });
  await p.click('[data-pref="stock"]'); await p.waitForTimeout(700);
  check('Préférence « stock » désactivée et enregistrée', DB.push_subscriptions[0].prefs.stock === false, JSON.stringify(DB.push_subscriptions[0].prefs));
  const nTest = REQLOG.filter(r => r === 'FN myra-push test').length; await p.click('#ntTest'); await p.waitForTimeout(900);
  check('Bouton « Tester »', REQLOG.filter(r => r === 'FN myra-push test').length === nTest + 1);
  await p.reload(); await p.waitForTimeout(2500);
  check('Au redémarrage : pas de nouvelle proposition, abonnement resynchronisé', !(await p.isVisible('#ntAsk')) && DB.push_subscriptions.length === 1 && DB.push_subscriptions[0].prefs.stock === false);
  await p.evaluate(() => window.MyraApp.navigate('notifications')); await p.waitForTimeout(1200);
  await p.click('#ntOff'); await p.waitForTimeout(1000);
  check('Désactivation : appareil retiré', DB.push_subscriptions.length === 0 && /Pas encore activées/.test(await p.textContent('#content, main')));
  check('Aucune erreur JavaScript (ordinateur)', errs.length === 0, errs.join(' | '));
  await ctx.close();
  // ---- « Plus tard » : plus de proposition pendant 2 semaines
  const c2 = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' }); await setup(c2, true);
  await c2.addInitScript(() => { try { localStorage.setItem('myra_v29_ready', '1'); } catch (_) {} }); await c2.addInitScript(fakePush, { perm: 'default' });
  const p2 = await c2.newPage(); await p2.goto(base); await p2.waitForTimeout(2500); await p2.click('#ntAsk [data-no]');
  await p2.evaluate(() => { const v = localStorage.getItem('myra_push_ask_later'); sessionStorage.setItem('keep', v); });
  check('« Plus tard » mémorisé', !(await p2.isVisible('#ntAsk')) && !!(await p2.evaluate(() => localStorage.getItem('myra_push_ask_later'))));
  await c2.close();
  // ---- Notifications bloquées
  const c3 = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' }); await setup(c3, true);
  await c3.addInitScript(() => { try { localStorage.setItem('myra_v29_ready', '1'); } catch (_) {} }); await c3.addInitScript(fakePush, { perm: 'denied' });
  const p3 = await c3.newPage(); await p3.goto(base); await p3.waitForTimeout(2000);
  check('Bloquées : pas de proposition', !(await p3.isVisible('#ntAsk')));
  await p3.evaluate(() => window.MyraApp.navigate('notifications')); await p3.waitForTimeout(1000);
  check('Bloquées : explication pour les réautoriser', /bloquées sur cet appareil/.test(await p3.textContent('#content, main')));
  await c3.close();
  // ---- iPhone dans Safari (application pas installée)
  const c4 = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }); await setup(c4, true);
  await c4.addInitScript(() => { try { localStorage.setItem('myra_v29_ready', '1'); } catch (_) {} }); await c4.addInitScript(fakePush, { perm: 'default', push: false });
  const p4 = await c4.newPage(); const e4 = []; p4.on('pageerror', e => e4.push(e.message)); await p4.goto(base); await p4.waitForTimeout(2000);
  await p4.evaluate(() => window.MyraApp.navigate('notifications')); await p4.waitForTimeout(1000);
  check('iPhone : consigne « Sur l’écran d’accueil »', /Sur l’écran d’accueil/.test(await p4.textContent('#content, main')));
  await p4.screenshot({ path: OUT + '/notif-iphone-safari.png' });
  check('Aucune erreur JavaScript (iPhone)', e4.length === 0, e4.join(' | '));
  await c4.close();
  // ---- Android installé : activation depuis l'écran
  const c5 = await b.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' }); await setup(c5, true);
  await c5.addInitScript(() => { try { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); } catch (_) {} }); await c5.addInitScript(fakePush, { perm: 'default' });
  const p5 = await c5.newPage(); await p5.goto(base); await p5.waitForTimeout(2000);
  await p5.evaluate(() => window.MyraApp.navigate('notifications')); await p5.waitForTimeout(1000);
  await p5.screenshot({ path: OUT + '/notif-android-avant.png' });
  await p5.click('#ntOn'); await p5.waitForTimeout(1500);
  check('Android : activation depuis l’écran', DB.push_subscriptions.length === 1 && /Android/.test(DB.push_subscriptions[0].device), DB.push_subscriptions[0]?.device);
  await p5.screenshot({ path: OUT + '/notif-android-active.png', fullPage: true });
  await c5.close();
  await b.close(); srv.close();
  results.forEach(r => console.log(r.join(' · ')));
  const ok = results.filter(r => r[0].startsWith('OK')).length; console.log(`\n${ok}/${results.length} vérifications réussies`); process.exit(ok === results.length ? 0 : 1);
});
