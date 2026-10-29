/* indusmova — service worker.
 *
 * The rule now: this worker never stands between a reader and a new build.
 *
 *   · the document is always fetched with `cache: 'no-store'`, so a deploy
 *     shows up on the next navigation instead of behind a cached shell;
 *   · code is network-first, and the stored copy is only an offline fallback;
 *   · a new worker takes over at once (skipWaiting + claim) and tells the open
 *     pages, so a tab that is already open can refresh itself;
 *   · the Wikimedia APIs and the model endpoint are never cached at all.
 */

const VERSION = 'indusmova-v4.1.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

/* Only what is needed to show something while offline. The document itself is
   deliberately not precached: a precached page is the thing that goes stale. */
const SHELL_ASSETS = [
  '/assets/v3/css/styles.css',
  '/assets/v3/css/app.css',
  '/assets/v3/js/app.js',
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Tell every open tab that a newer build is in charge now.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.postMessage({ type: 'galeo-activated', version: VERSION });
  })());
});

function isApiRequest(url) {
  return /(^|\.)wikipedia\.org$|(^|\.)wikidata\.org$|(^|\.)wikimedia\.org$|(^|\.)hf\.co$|(^|\.)huggingface\.co$|cdn\.jsdelivr\.net$/.test(url.hostname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the knowledge APIs, the model endpoint or the model CDN.
  if (isApiRequest(url)) return;
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // A navigation is the document itself: always from the network, never from
  // a stored copy. Only if the network is gone does the offline shell answer.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' });
      } catch {
        const cached = await caches.match('/index.html') || await caches.match('/');
        return cached || new Response('<h1>Offline</h1><p>Reconnect to read indusmova.</p>', {
          status: 503, headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // Same-origin code: network first, revalidating, with the cache kept only
  // as the offline fallback. This was cache-first once, which is exactly why
  // a deploy could be invisible for a returning reader.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  // The page asks for this when it notices a newer build.
  if (event.data === 'clear-caches') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
