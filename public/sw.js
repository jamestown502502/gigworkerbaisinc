// Offline support, for the Android (Trusted Web Activity) build as much as the web.
//
// Google Play's minimum-functionality policy expects a wrapped web app to work at a basic level
// offline; before this file the game had no service worker at all and showed the browser's
// offline page. Strategy, by what each URL is:
//   - the page itself: network-first, so a deploy is picked up on the next launch; the cached copy
//     is the offline fallback
//   - /assets/ (Vite output, content-hashed names): cache-first, a hashed file never changes
//   - everything else same-origin (art, audio, icons, manifest): stale-while-revalidate, instant
//     from cache and refreshed in the background, because these keep the same URL across deploys
// CACHE_NAME changes only when this strategy changes; content updates flow through the rules above.
const CACHE_NAME = 'gigworker-v1';
// The game's JS loads as a CORS module request carrying an Origin header, and the host answers with
// a Vary header, so a strict lookup misses a file that IS cached and the game fails to boot offline.
// These are static files with one representation each, so Vary can be ignored safely.
const MATCH = { ignoreVary: true };

// The music is precached whole here: the audio element fetches it in ranged pieces (206), which
// cannot be cached at runtime, and would otherwise be the one thing missing offline.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['./', './manifest.webmanifest', './audio/apartment-bgm.mp3'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The first visit's files were fetched before this worker existed, so they are not cached yet.
// The page sends the list it loaded (src/main.js) and they are cached now, which makes the very
// first launch offline-capable rather than the second.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls') return;
  const urls = (event.data.urls || []).filter((u) => new URL(u).origin === self.location.origin);
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(urls.map((u) => cache.add(u).catch(() => {})))));
});

function putInCache(request, res) {
  // 200 only: a ranged audio response (206) cannot be stored and would throw.
  if (res && res.status === 200) caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone())).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => putInCache(request, res))
        .catch(() => caches.match(request, MATCH).then((hit) => hit || caches.match('./', MATCH))),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request, MATCH).then((hit) => hit || fetch(request).then((res) => putInCache(request, res))));
    return;
  }

  event.respondWith(
    caches.match(request, MATCH).then((hit) => {
      const network = fetch(request).then((res) => putInCache(request, res)).catch(() => hit);
      return hit || network;
    }),
  );
});
