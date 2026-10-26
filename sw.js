/* indusmova — service worker.
 *
 * Keeps the app shell available offline and serves static assets from cache.
 * It deliberately never caches the Wikimedia API: an answer should be fresh,
 * and the app already has its own in-memory cache for that.
 */

const VERSION = 'indusmova-v3.5.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/assets/v3/css/styles.css',
  '/assets/v3/css/app.css',
  '/assets/v3/js/app.js',
  '/assets/v3/js/skills.js',
  '/assets/v3/js/config.js',
  '/assets/v3/js/ui.js',
  '/assets/v3/js/i18n.js',
  '/assets/v3/js/icons.js',
  '/assets/v3/js/api.js',
  '/assets/v3/js/store.js',
  '/assets/v3/js/theme.js',
  '/assets/v3/js/router.js',
  '/assets/v3/js/components.js',
  '/assets/v3/js/composer.js',
  '/assets/v3/js/parse.js',
  '/assets/v3/js/answer.js',
  '/assets/v3/js/answerui.js',
  '/assets/v3/js/sources.js',
  '/assets/v3/js/rank.js',
  '/assets/v3/js/markdown.js',
  '/assets/v3/js/views/home.js',
  '/assets/v3/js/views/search.js',
  '/assets/v3/js/views/ask.js',
  '/assets/v3/js/views/article.js',
  '/assets/v3/js/views/chat.js',
  '/assets/v3/js/views/pages.js',
  '/assets/v3/js/views/library.js',
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
