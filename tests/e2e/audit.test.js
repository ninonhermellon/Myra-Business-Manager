// Audit : en-têtes de sécurité (vercel.json appliqué localement), SEO / Open Graph, responsive (6 largeurs)
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(__dirname + '/screens.js', 'utf8').replace(/srv\.listen\(0[\s\S]*$/, 'module.exports={srv,setup,DB};');
const mod = { exports: {} }; new Function('require', 'module', 'process', '__dirname', src)(require, mod, { argv: ['', '', ROOT, path.join(__dirname, 'output')], env: {} }, __dirname);
const { srv, setup } = mod.exports; const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const check = (n, ok, d = '') => results.push([ok ? 'OK ' : 'ÉCHEC', n, d]);

// Applique vercel.json comme Vercel : réécritures, puis en-têtes (la dernière règle correspondante l'emporte)
const vercel = JSON.parse(fs.readFileSync(ROOT + '/vercel.json', 'utf8'));
const rx = s => new RegExp('^' + s + '$');
const handlers = srv.listeners('request'); srv.removeAllListeners('request');
srv.on('request', (req, res) => {
  const p = req.url.split('?')[0];
  for (const rule of vercel.headers) if (rx(rule.source).test(p)) rule.headers.forEach(h => res.setHeader(h.key, h.value));
  const rw = vercel.rewrites.find(r => rx(r.source).test(p)); if (rw) req.url = rw.destination + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  handlers.forEach(h => h.call(srv, req, res));
});

const WIDTHS = [320, 375, 414, 768, 1024, 1440];
srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}`; const b = await chromium.launch();
  const PUBLIC = [['/boutique', 'Boutique'], ['/boutique.html', 'Boutique (.html)'], ['/client.html?t=' + 'a'.repeat(64), 'Espace client'], ['/avis.html?t=' + 'c'.repeat(64), 'Avis']];
  for (const [url, name] of PUBLIC) {
    const csp = [], errs = [], over = [];
    for (const w of WIDTHS) {
      const ctx = await b.newContext({ viewport: { width: w, height: 800 }, serviceWorkers: 'block' }); await setup(ctx, 'visitor');
      const p = await ctx.newPage();
      p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 140)); });
      p.on('pageerror', e => errs.push(e.message));
      const r = await p.goto(base + url); await p.waitForTimeout(1300);
      if (w === 375) {
        const h = r.headers();
        check(`${name} : CSP stricte (aucun script injecté)`, /script-src 'self';/.test(h['content-security-policy'] || '') && h['x-frame-options'] === 'DENY', h['content-security-policy']?.slice(0, 40));
        if (url.startsWith('/boutique')) {
          await p.click('.card-hit >> nth=0'); await p.waitForTimeout(300); await p.click('#pdAdd'); await p.click('#cartBar'); await p.click('#toCheckout'); await p.waitForTimeout(300);
          check(`${name} : parcours de commande fonctionnel sous CSP stricte`, await p.isVisible('#orderForm'));
          await p.keyboard.press('Escape');
        }
      }
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 1) over.push(`${w}px:+${ov}`);
      if (w === 320 || w === 1440) await p.screenshot({ path: `${OUT}/audit-${name.replace(/\W+/g, '-')}-${w}.png` });
      await ctx.close();
    }
    check(`${name} : aucune violation de sécurité`, csp.length === 0, csp.slice(0, 2).join(' | '));
    check(`${name} : aucune erreur JavaScript`, errs.length === 0, errs.slice(0, 2).join(' | '));
    check(`${name} : pas de débordement horizontal (320 → 1440 px)`, over.length === 0, over.join(', '));
  }
  // Application (connectée) : écrans principaux, téléphone et ordinateur
  const APP = ['dashboard', 'sales', 'commandes', 'customers', 'products', 'shop', 'notifications', 'finances'];
  for (const w of [360, 1024]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, serviceWorkers: 'block' }); await setup(ctx, true);
    await ctx.addInitScript(() => { try { localStorage.setItem('myra_v29_ready', '1'); localStorage.setItem('myra_push_ask_later', String(Date.now())); } catch (_) {} });
    const p = await ctx.newPage(); const csp = [], errs = [], over = [];
    p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 140)); }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + '/'); await p.waitForTimeout(2200);
    for (const pg of APP) { await p.evaluate(x => window.MyraApp.navigate(x), pg); await p.waitForTimeout(900); const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 1) over.push(`${pg}:+${ov}`); }
    check(`Application ${w}px : aucune violation de sécurité`, csp.length === 0, csp.slice(0, 2).join(' | '));
    check(`Application ${w}px : aucune erreur JavaScript`, errs.length === 0, errs.slice(0, 2).join(' | '));
    check(`Application ${w}px : pas de débordement horizontal (${APP.length} écrans)`, over.length === 0, over.join(', '));
    await ctx.close();
  }
  // SEO / Open Graph de chaque page
  for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.html'))) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8'); const m = (re) => (re.exec(h) || [])[1];
    const img = m(/property="og:image" content="([^"]+)"/), title = m(/<title>([^<]+)<\/title>/), desc = m(/name="description" content="([^"]+)"/);
    const local = img && path.join(ROOT, new URL(img).pathname);
    check(`${f} : Open Graph complet (image absolue https, existante, < 300 Ko)`, !!img && /^https:\/\//.test(img) && fs.existsSync(local) && fs.statSync(local).size < 300 * 1024
      && /og:title/.test(h) && /og:description/.test(h) && /og:url/.test(h) && /twitter:card/.test(h) && (h.match(/<title>/g) || []).length === 1, img);
    check(`${f} : titre ≤ 60 et description 50–200 caractères`, title && title.length <= 60 && desc && desc.length >= 50 && desc.length <= 230, `${title?.length} / ${desc?.length}`);
    check(`${f} : favicon et icône Apple`, /href="\/favicon\.ico"/.test(h) && /apple-touch-icon/.test(h));
  }
  ['favicon.ico', 'apple-touch-icon.png', 'robots.txt', 'sitemap.xml', 'assets/og/og-boutique.jpg', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png'].forEach(f => check(`Fichier présent : ${f}`, fs.existsSync(path.join(ROOT, f))));
  await b.close(); srv.close();
  results.forEach(r => console.log(r.join(' · ')));
  const ok = results.filter(r => r[0].startsWith('OK')).length; console.log(`\n${ok}/${results.length} vérifications réussies`); process.exit(ok === results.length ? 0 : 1);
});
