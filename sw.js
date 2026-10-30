/* QUIZFORCE PWA: cache the public quiz shell for offline practice.
   All API requests remain network-only. Navigation is network-first for updates. */
const CACHE = 'quizforce-game-pwa-2026-10-30-v1';
const SHELL = ['/index.html','/manifest.webmanifest','/icon-192.png','/icon-512.png','/icon-maskable-512.png','/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async url => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('quizforce-game-pwa-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE);
          event.waitUntil(cache.put('/index.html', response.clone()).catch(() => {}));
        }
        return response;
      } catch (_) {
        return (await caches.match('/index.html')) || new Response('QUIZFORCE needs internet to load for the first time.', { status: 503, headers: {'Content-Type':'text/plain; charset=utf-8'} });
      }
    })());
    return;
  }
  if (SHELL.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(url.pathname);
      if (cached) return cached;
      return fetch(request);
    })());
  }
});
