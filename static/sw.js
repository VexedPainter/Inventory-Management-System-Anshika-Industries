/**
 * Anishka Inventory Management System - Service Worker
 * Provides offline application shell caching and offline resilience for storekeepers.
 */

const CACHE_NAME = 'anishka-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/static/index.html',
  '/static/login.html',
  '/static/styles.css',
  '/static/app.js',
  '/static/manifest.json',
  '/static/vendor/chart.umd.min.js',
  '/static/vendor/html5-qrcode.min.js',
  '/static/vendor/inter.css',
  '/static/vendor/space-grotesk.css',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/apple-touch-icon.png',
  '/static/icons/favicon-32.png'
];

// Install: precache static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Precaching static application shell');
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Precache partial error (continuing):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for dynamic API; Cache-first with network fallback for shell assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests (mutations handled by IndexedDB offline queue)
  if (req.method !== 'GET') {
    return;
  }

  // Handle static assets & navigation
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/static/') || url.pathname === '/' || url.pathname === '/manifest.json') {
      event.respondWith(
        caches.match(req).then((cachedResponse) => {
          if (cachedResponse) {
            // Revalidate in background
            fetch(req).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
              }
            }).catch(() => {});
            return cachedResponse;
          }
          return fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const respClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
            }
            return networkResponse;
          }).catch(() => {
            // If offline navigate, serve root shell
            if (req.mode === 'navigate') {
              return caches.match('/');
            }
          });
        })
      );
      return;
    }

    // For API GET endpoints: Network-first with cache fallback
    if (url.pathname.startsWith('/api/items') || url.pathname.startsWith('/api/stats')) {
      event.respondWith(
        fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const respClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
          }
          return networkResponse;
        }).catch(() => {
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            return new Response(JSON.stringify({ offline: true, items: [] }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
      );
    }
  }
});
