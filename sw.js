const CACHE_NAME = 'nouri-v11';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/db.js',
  './js/charts.js',
  './js/foods-data.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ── Background Sync: Save pending activity data ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-activity-tracker') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_TRACKER_STATE' });
        });
      })
    );
  }
});

// ── Periodic Background Sync (where supported) ──
self.addEventListener('periodicsync', event => {
  if (event.tag === 'activity-keepalive') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'PERIODIC_KEEPALIVE' });
        });
      })
    );
  }
});

// ── Handle messages from app ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'TRACKER_ACTIVE') {
    // Keep the service worker alive while tracker is active
    // This helps prevent iOS from killing the app
  }
});
