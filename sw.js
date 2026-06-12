const CACHE_NAME = 'laundry-pos-v2';
const urlsToCache = ['index.html', 'manifest.json', 'icon.svg'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => {
            if (event.request.url.startsWith(self.location.origin)) {
              cache.put(event.request, copy);
            }
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(res => res !== undefined ? res : new Response('Offline', { status: 503 })))
  );
});
