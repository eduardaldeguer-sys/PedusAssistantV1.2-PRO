/* PedusAssistant — service worker.
   Estrategia "red primero": siempre se sirve la última versión desplegada y la caché
   solo se usa si no hay red (o Render está arrancando). Así un deploy nuevo se ve
   al momento, sin quedarse con un app.js antiguo. La API nunca se cachea. */
const CACHE = 'pedus-v1.3.0';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './js/api.js',
  './js/store.js',
  './js/speech.js',
  './js/mic.js',
  './js/screen.js',
  './js/ticker.js',
  './js/pip.js',
  './js/orb.js',
  './js/presets.js',
  './icon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const cacheKey = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(cacheKey, copy));
        }
        return res;
      })
      .catch(() => caches.match(cacheKey).then((cached) => cached || Response.error())),
  );
});
