// Service worker de Don Enrique: guarda la app en el celular para que abra sin señal.
// Las llamadas a la planilla (otro dominio) nunca pasan por acá: las maneja la app con su cola de cambios.
/* STAMP:BEGIN */
const BUILD = '3e56bba52e';
const SHELL = ["./","css/app.css","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","index.html","js/api.js","js/connect.js","js/forms.js","js/icons.js","js/main.js","js/mock.js","js/model.js","js/rules.js","js/schema.js","js/store.js","js/sync.js","js/ui.js","js/util.js","js/views/actions.js","js/views/ajustes.js","js/views/bienvenida.js","js/views/combustible.js","js/views/cosecha.js","js/views/home.js","js/views/labores.js","js/views/mas.js","js/views/shared.js","manifest.webmanifest"];
/* STAMP:END */
const CACHE = `de-shell-${BUILD}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('de-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const fallback = await cache.match('index.html') || await cache.match('./');
        if (fallback) return fallback;
      }
      return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
