const CACHE_NAME = 'life-currents-v' + Date.now(); // Dynamic cache name
// Only cache URLs we actually ship. Vite builds use hashed filenames, so don't pre-cache bundle paths.
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/placeholder.svg'
];

self.addEventListener('install', (event) => {
  // Force immediate activation
  self.skipWaiting();

  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const url of urlsToCache) {
        try {
          const resp = await fetch(url, { cache: 'no-store' });
          if (resp && resp.ok) {
            await cache.put(url, resp.clone());
          }
        } catch (err) {
          // Skip failing URLs; do not fail install
          // console.warn('SW: skipping cache for', url, err);
        }
      }
    } catch (e) {
      // Do not fail install on any error
    }
  })());
});

self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Take control immediately
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass third-party and extension schemes
  if (url.origin !== self.location.origin) return;

  // Check for cache-busting parameter
  if (event.request.url.includes('_t=')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const resp = await fetch(event.request);
      // Cache GET successful responses for future
      if (event.request.method === 'GET' && resp && resp.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, resp.clone());
      }
      return resp;
    } catch (e) {
      // Network failed and no cache
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});