/**
 * InvenIQ Service Worker — App Shell Cache Strategy
 * Caches the shell (HTML, fonts) for offline resilience.
 * API calls always go to the network (never cached — data must be live).
 */

const CACHE_NAME = 'inveniq-shell-v1';

// App shell assets to pre-cache on install
const SHELL_URLS = [
  '/',
  '/manifest.json',
];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for /api/*, cache-first for shell assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always bypass cache for API calls — data must be live
  if (url.pathname.startsWith('/api/')) return;

  // For navigation requests (HTML), try network then fall back to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  // For other assets: cache-first (JS/CSS bundles are content-hashed by CRA)
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
    )
  );
});
