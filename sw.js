// MAMA'S LOVE LAUNDRY POS — Service Worker
// OFFLINE MODE: caches the app shell AND all CDN scripts (Firebase, Tailwind,
// SweetAlert, dayjs, localforage, SheetJS, qrcode) so the POS boots and takes
// orders with no internet. Firestore's offline persistence then queues order
// writes and syncs them automatically when the connection returns.
//
// CACHE_VERSION must be bumped whenever index.html or sw.js changes so every
// device picks up the update on next launch.
const CACHE_VERSION = 'laundry-pos-v4';

const APP_SHELL = ['index.html', 'manifest.json', 'icon.svg', './'];

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/utc.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/timezone.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/isBetween.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/relativeTime.js',
  'https://cdn.jsdelivr.net/npm/localforage/dist/localforage.min.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator/qrcode.js',
  'https://cdn.tailwindcss.com',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      // Warm the cache with the app shell + CDN scripts. cdn.tailwindcss.com
      // returns a generated stylesheet that changes, so failures there must not
      // block installation — runtime caching handles it on first online visit.
      Promise.allSettled([
        cache.addAll(APP_SHELL),
        cache.addAll(CDN_ASSETS)
      ])
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache Firestore/Google API traffic — Firestore handles its own offline queue.
  if (/googleapis\.com|firebaseio\.com|firebaseinstallations/.test(url.hostname)) return;

  // Stale-while-revalidate: serve from cache instantly, refresh in background.
  // Result: app loads instantly, works offline, and still picks up updates.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const networkFetch = fetch(req).then(response => {
        if (response && response.ok && (url.origin === self.location.origin || url.hostname.includes('cdn.') || url.hostname.includes('gstatic.com') || url.hostname.includes('jsdelivr.net') || url.hostname.includes('sheetjs.com'))) {
          cache.put(req, response.clone());
        }
        return response;
      }).catch(() => undefined);

      if (cached) {
        event.waitUntil(networkFetch);
        return cached;
      }

      // Nothing cached (first ever visit offline): try network, else app shell fallback.
      const fresh = await networkFetch;
      if (fresh) return fresh;

      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
