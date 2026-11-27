#!/usr/bin/env node
/* Génère les en-têtes SEO / Open Graph de toutes les pages à partir de tools/seo.config.json,
   ainsi que robots.txt et sitemap.xml. Une seule source de vérité : changer le domaine ou un texte
   dans la configuration, puis lancer :  node tools/seo-build.js
   Les balises sont écrites dans le HTML (les robots de WhatsApp, Facebook… n'exécutent pas le JavaScript). */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'seo.config.json'), 'utf8'));
const site = cfg.siteUrl.replace(/\/+$/, '');
const abs = p => site + (p.startsWith('/') ? p : '/' + p);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BEGIN = '<!-- SEO:BEGIN — généré par tools/seo-build.js, ne pas modifier à la main -->';
const END = '<!-- SEO:END -->';

// Balises déjà présentes que le bloc remplace (évite les doublons)
const STRIP = [
  /\s*<title>[\s\S]*?<\/title>/gi,
  /\s*<meta\s+name="(description|robots|theme-color|twitter:[^"]+|application-name)"[^>]*>/gi,
  /\s*<meta\s+property="og:[^"]+"[^>]*>/gi,
  /\s*<link\s+rel="(icon|shortcut icon|apple-touch-icon|canonical|manifest|mask-icon)"[^>]*>/gi,
  /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/gi,
];

function jsonld(p) {
  const data = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.siteName, url: abs(p.path), inLanguage: 'fr' },
    { '@context': 'https://schema.org', '@type': 'Store', '@id': abs('/#entreprise'), name: cfg.siteName, url: abs(p.path),
      logo: abs('/assets/icons/public-512.png'), image: [abs(p.image), abs('/assets/og/og-square.jpg')], description: p.description,
      slogan: 'Le secret de nos marmites', currenciesAccepted: 'XAF', paymentAccepted: 'Espèces, Mobile Money',
      address: { '@type': 'PostalAddress', addressLocality: 'Brazzaville', addressCountry: 'CG' }, areaServed: { '@type': 'City', name: 'Brazzaville' } },
  ];
  return `\n  <script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function block(file, p) {
  const img = abs(p.image), url = abs(p.path), title = p.title, ogTitle = p.ogTitle || title, ogDesc = p.ogDescription || p.description;
  const L = [
    BEGIN,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    `<meta name="robots" content="${esc(p.robots)}">`,
    `<meta name="theme-color" content="${esc(cfg.themeColor)}">`,
    `<meta name="application-name" content="${esc(file === 'index.html' ? 'LSM Manager' : cfg.siteName)}">`,
    p.noCanonical ? '' : `<link rel="canonical" href="${esc(url)}">`,
    // Logo officiel : fond vert pour l'application (administration), fond blanc pour les pages publiques
    ...(['index.html', 'loyverse.html'].includes(file) ? [
      `<link rel="icon" href="/favicon.ico" sizes="any">`,
      `<link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">`,
      `<link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/favicon-16x16.png">`,
      `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`] : [
      `<link rel="icon" type="image/png" sizes="192x192" href="/assets/icons/public-192.png">`,
      `<link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/public-32.png">`,
      `<link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/public-180.png">`]),
    p.manifest ? `<link rel="manifest" href="manifest.webmanifest">` : '',
    `<meta property="og:type" content="${esc(p.type || 'website')}">`,
    `<meta property="og:site_name" content="${esc(cfg.siteName)}">`,
    `<meta property="og:locale" content="${esc(cfg.locale)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${esc(ogDesc)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:image:secure_url" content="${esc(img)}">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(p.imageAlt || ogTitle)}">`,
    `<meta property="og:image" content="${esc(abs('/assets/og/og-square.jpg'))}">`,
    `<meta property="og:image:width" content="1080">`,
    `<meta property="og:image:height" content="1080">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(ogTitle)}">`,
    `<meta name="twitter:description" content="${esc(ogDesc)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    `<meta name="twitter:image:alt" content="${esc(p.imageAlt || ogTitle)}">`,
  ].filter(Boolean).map(l => '  ' + l).join('\n');
  return '\n' + L + (p.jsonld ? jsonld(p) : '') + '\n  ' + END;
}

let changed = 0;
for (const [file, p] of Object.entries(cfg.pages)) {
  const f = path.join(ROOT, file); if (!fs.existsSync(f)) { console.warn('absent :', file); continue; }
  let html = fs.readFileSync(f, 'utf8');
  html = html.replace(new RegExp('\\s*' + BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END), '');
  for (const r of STRIP) html = html.replace(r, '');
  const vp = /<meta\s+name="viewport"[^>]*>/i.exec(html);
  if (!vp) throw new Error('Balise viewport introuvable dans ' + file);
  html = html.slice(0, vp.index + vp[0].length) + block(file, p) + html.slice(vp.index + vp[0].length);
  fs.writeFileSync(f, html); changed++;
}

const indexable = Object.values(cfg.pages).filter(p => /(^|,\s*)index/.test(p.robots) && !p.noCanonical);
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${[...new Map(indexable.map(p => [p.path, p])).values()].map(p => `  <url>\n    <loc>${abs(p.path)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n    <image:image><image:loc>${abs(p.image)}</image:loc></image:image>\n  </url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `# Les saveurs de Myra\n# Seule la boutique est destinée aux moteurs de recherche ; les autres pages portent « noindex ».\n# (Pas de « Disallow » : les aperçus WhatsApp / Facebook doivent pouvoir lire toutes les pages.)\nUser-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);
console.log(`${changed} page(s) mises à jour · sitemap.xml et robots.txt générés pour ${site}`);
