/**
 * indusmova — HTML must never be cached at the edge.
 *
 * Why this file exists: the deployment was correct but the root path `/` kept
 * serving a build from weeks earlier. `/index.html`, `/how-it-works/` and
 * `/chat/` were all fresh; `/` was stale. That is Cloudflare's edge cache
 * holding an old copy of one path, and a reader's hard refresh cannot reach
 * it — the stale response is produced by Cloudflare, not by their browser.
 *
 * `_headers` alone was not enough: a cached object outlives a change to the
 * header file. A Pages Function, by contrast, runs before the asset is served,
 * so every HTML response is rebuilt from the current deployment and goes out
 * with `no-store`. Nothing HTML-shaped can be stored at the edge again.
 *
 * Only HTML is touched. JS, CSS, images, the manifest and /api/* pass through
 * exactly as they are.
 */

const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';

export async function onRequest(context) {
  const response = await context.next();

  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', NO_STORE);
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Pragma', 'no-cache');
  // Say which deployment answered, so a stale copy is visible in one glance.
  headers.set('X-Indusmova-Page', 'function');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
