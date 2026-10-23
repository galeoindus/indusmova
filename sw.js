/* indusmova — service worker.
 *
 * Keeps the app shell available offline and serves static assets from cache.
 * It deliberately never caches the Wikimedia API: an answer should be fresh,
 * and the app already has its own in-memory cache for that.
 */

const VERSION = 'indusmova-v3.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/assets/css/styles.css',
  '/assets/css/app.css',
  '/assets/js/app.js',
  '/assets/js/config.js',
  '/assets/js/ui.js',
  '/assets/js/i18n.js',
  '/assets/js/icons.js',
  '/assets/js/api.js',
  '/assets/js/store.js',
  '/assets/js/theme.js',
  '/assets/js/router.js',
  '/assets/js/components.js',
  '/assets/js/composer.js',
  '/assets/js/parse.js',
  '/assets/js/answer.js',
  '/assets/js/answerui.js',
  '/assets/js/sources.js',
  '/assets/js/rank.js',
  '/assets/js/markdown.js',
  '/assets/js/views/home.js',
  '/assets/js/views/search.js',
  '/assets/js/views/ask.js',
  '/assets/js/views/article.js',
  '/assets/js/views/pages.js',
  '/assets/js/views/library.js',
  '/assets/img/favicon.svg',
  '/assets/img/icon-192.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return /(^|\.)wikipedia\.org$|(^|\.)wikidata\.org$|(^|\.)wikimedia\.org$|(^|\.)hf\.co$|(^|\.)huggingface\.co$|cdn\.jsdelivr\.net$/.test(url.hostname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the knowledge APIs or the model CDN.
  if (isApiRequest(url)) return;

  // App navigations: network first, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Same-origin static assets: network first, cache as the offline fallback.
  //
  // This was cache-first, which meant the first visit after a deploy still ran
  // the previous CSS and JavaScript — a reader would see the old design and
  // reasonably conclude nothing had been fixed. Freshness wins over a few
  // milliseconds; the cache still covers going offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request)),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  // The page asks for this when it notices a newer build.
  if (event.data === 'clear-caches') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
