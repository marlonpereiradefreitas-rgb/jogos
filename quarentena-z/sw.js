/* Cache offline para o Apocalipse. Atualize CACHE_VERSION ao publicar novas versões. */
const CACHE_VERSION = 'quarentena-z-v19-16';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=19.16',
  './theme-v19.css?v=19.16',
  './game.js?v=19.16',
  './manifest.webmanifest',
  './assets/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('apocalipse-web-') || key.startsWith('quarentena-z-')) && key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => {
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw new Error('Recurso indisponível offline');
    });
  }));
});
