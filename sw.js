/* Myra Business Manager — cache applicatif résilient */
const CACHE_NAME = 'myra-manager-shell-v21';
const RUNTIME_CACHE = 'myra-manager-runtime-v21';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './css/styles.css', './css/ux.css', './css/pro.css', './css/v28.css', './css/mobile.css', './vendor/fontawesome-6.5.2/css/all.min.css', './vendor/fontawesome-6.5.2/webfonts/fa-solid-900.woff2', './vendor/fontawesome-6.5.2/webfonts/fa-regular-400.woff2', './vendor/fontawesome-6.5.2/webfonts/fa-brands-400.woff2',
  './vendor/supabase-js-2.118.0.min.js', './css/ext.css', './vendor/qrcode-generator-1.4.4/qrcode.js', './js/ext/core.js', './js/ext/tracabilite.js', './js/ext/b2b.js', './js/ext/evenements.js', './js/ext/equipe.js', './js/ext/lieux.js', './js/ext/intelligence.js', './js/ext/activation.js', './js/ext/relation.js', './js/ext/pilotage.js', './js/ext/confort.js', './js/ext/boutique.js', './js/config.js', './js/app.js', './js/pwa.js', './js/ui-kit.js', './js/shell.js',
  './assets/favicon.png', './assets/logo-les-saveurs-de-myra.png'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async path => {
      try { const response = await fetch(new Request(path, {cache:'reload'})); if (response.ok) await cache.put(path, response); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('myra-manager-') && ![CACHE_NAME,RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // APIs et CDN : jamais de cache de données sensibles
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;
  event.respondWith((async () => {
    const cached = await caches.match(req);
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && (req.destination === 'document' || req.destination === 'style' || req.destination === 'script' || req.destination === 'image' || url.pathname.endsWith('.webmanifest'))) {
        const cache = await caches.open(RUNTIME_CACHE); cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (_) {
      if (cached) return cached;
      if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
