/* indusmova — the hash router.
 *
 * One document serves every in-app view, so navigation is a hash change:
 * #/ , #/ask , #/explore , #/today , #/bookmarks , #/history , #/sources ,
 * #/topics , #/article/<Title> , #/search?q=… , #/about , #/privacy , #/terms ,
 * #/accessibility , #/support , #/feedback .
 *
 * A hash keeps the app a single static file (which is what makes it deployable
 * to Cloudflare Pages with no build step) while still giving every view an
 * address a reader can bookmark or share.
 */

const ROUTES = [
  { name: 'home', pattern: /^\/?$/ },
  { name: 'ask', pattern: /^\/ask\/?$/ },
  { name: 'explore', pattern: /^\/explore\/?$/ },
  { name: 'today', pattern: /^\/today\/?$/ },
  { name: 'bookmarks', pattern: /^\/bookmarks\/?$/ },
  { name: 'history', pattern: /^\/history\/?$/ },
  { name: 'sources', pattern: /^\/sources\/?$/ },
  { name: 'topics', pattern: /^\/topics\/?$/ },
  { name: 'search', pattern: /^\/search\/?$/ },
  { name: 'article', pattern: /^\/article\/(.+)$/ },
  { name: 'about', pattern: /^\/about\/?$/ },
  { name: 'privacy', pattern: /^\/privacy\/?$/ },
  { name: 'terms', pattern: /^\/terms\/?$/ },
  { name: 'accessibility', pattern: /^\/accessibility\/?$/ },
  { name: 'support', pattern: /^\/support\/?$/ },
  { name: 'feedback', pattern: /^\/feedback\/?$/ },
];

let handlers = [];
let lastPath = null;

export function parse(hash = window.location.hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart || '/';
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  for (const route of ROUTES) {
    const m = path.match(route.pattern);
    if (m) {
      return {
        name: route.name,
        path,
        query,
        params: { title: m[1] ? decodeURIComponent(m[1]) : '' },
      };
    }
  }
  return { name: 'notfound', path, query, params: {} };
}

export function current() {
  return parse();
}

export function href(path) {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function articleHref(title, lang) {
  const base = `#/article/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
  return lang ? `${base}?lang=${encodeURIComponent(lang)}` : base;
}

export function searchHref(q, { mode = 'search', lang } = {}) {
  const params = new URLSearchParams({ q: String(q || '') });
  if (mode === 'ask') params.set('mode', 'ask');
  if (lang) params.set('lang', lang);
  return `#/${mode === 'ask' ? 'ask' : 'search'}?${params.toString()}`;
}

export function navigate(path, { replace = false } = {}) {
  const target = href(path);
  if (replace) history.replaceState(null, '', target);
  else window.location.hash = target;
  if (replace) dispatch();
}

export function onChange(fn) {
  handlers.push(fn);
  return () => { handlers = handlers.filter((h) => h !== fn); };
}

function dispatch() {
  const route = current();
  const key = `${route.name}:${route.path}`;
  if (key === lastPath) return;
  lastPath = key;
  for (const fn of handlers) {
    try { fn(route); } catch (err) { console.error('route handler failed', err); }
  }
  document.dispatchEvent(new CustomEvent('indusmova:route', { detail: route }));
}

export function start() {
  window.addEventListener('hashchange', dispatch);
  // Normalise a bare "#/x" and an empty hash to the same route.
  if (!window.location.hash) history.replaceState(null, '', '#/');
  dispatch();
}

/** Intercept clicks on in-app links so they scroll to the top like a page. */
export function initLinkBehaviour() {
  document.addEventListener('click', (event) => {
    const a = event.target.closest?.('a[href^="#/"]');
    if (!a) return;
    if (a.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey) return;
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  });
}
