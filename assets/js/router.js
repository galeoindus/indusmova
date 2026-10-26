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

import { slugify, unslug } from './meta.js';

const ROUTES = [
  { name: 'home', pattern: /^\/?$/ },
  { name: 'ask', pattern: /^\/ask\/?$/ },
  { name: 'chat', pattern: /^\/chat\/?$/ },
  { name: 'explore', pattern: /^\/explore\/?$/ },
  { name: 'today', pattern: /^\/today\/?$/ },
  { name: 'bookmarks', pattern: /^\/bookmarks\/?$/ },
  { name: 'history', pattern: /^\/history\/?$/ },
  { name: 'sources', pattern: /^\/sources\/?$/ },
  { name: 'topics', pattern: /^\/topics\/?$/ },
  { name: 'library', pattern: /^\/library\/?$/ },
  { name: 'work', pattern: /^\/work\/?$/ },
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

/**
 * A real article path, as served after the /articles/* rewrite.
 * Returns null when the address bar holds an ordinary page.
 */
export function parsePath(pathname = window.location.pathname) {
  const m = String(pathname).match(/^\/articles\/(.+?)\/?$/);
  if (!m) return null;
  const title = unslug(decodeURIComponent(m[1]));
  const query = Object.fromEntries(new URLSearchParams(window.location.search || ''));
  return {
    name: 'article',
    path: `/article/${encodeURIComponent(slugify(title))}`,
    query,
    params: { title },
  };
}

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

/**
 * The identity of a route, for deciding whether anything changed.
 *
 * The query is part of it, sorted so {a,b} and {b,a} are the same route.
 * Without the query, moving from #/search?q=Ashoka to #/search?q=photosynthesis
 * looks like the same route and nothing re-renders — the bug the audit found
 * (F-01), and the first thing its tests should pin down.
 */
export function routeKey(route) {
  const queryKey = JSON.stringify(
    Object.entries(route?.query || {}).sort(([a], [b]) => a.localeCompare(b)),
  );
  return `${route?.name || ''}:${route?.path || ''}:${queryKey}`;
}

export function current() {
  // A fragment, once there is one, is the route — that is how in-app
  // navigation works. The path is used only on a cold load of a shared
  // /articles/<slug> link, so the address bar is not rewritten under the reader.
  const hash = window.location.hash;
  if (hash && hash.length > 1) return parse(hash);
  return parsePath() || parse(hash);
}

export function href(path) {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function articleHref(title, lang, project) {
  const base = `#/article/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
  const params = new URLSearchParams();
  if (lang) params.set('lang', lang);
  if (project && project !== 'wikipedia') params.set('project', project);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function libraryHref(q, { src } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (src) params.set('src', src);
  const qs = params.toString();
  return `#/library${qs ? `?${qs}` : ''}`;
}

/**
 * The address to put in the bar for an article: a real path where the page can
 * serve one, the in-app route otherwise.
 */
export function articlePath(title, lang, project) {
  const params = new URLSearchParams();
  if (lang) params.set('lang', lang);
  if (project && project !== 'wikipedia') params.set('project', project);
  const q = params.toString();
  return `/articles/${slugify(title)}${q ? `?${q}` : ''}`;
}

export function workHref(source, id) {
  return `#/work?src=${encodeURIComponent(source)}&id=${encodeURIComponent(String(id))}`;
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
  // Landing on /articles/<slug> and then navigating in-app leaves the old path
  // in front of the new fragment; drop it so the URL stays tidy.
  if (window.location.hash && window.location.hash.length > 1 && parsePath()) {
    history.replaceState(null, '', `/${window.location.hash}`);
  }
  const route = current();
  const key = routeKey(route);
  if (key === lastPath) return;
  lastPath = key;
  for (const fn of handlers) {
    try { fn(route); } catch (err) { console.error('route handler failed', err); }
  }
  document.dispatchEvent(new CustomEvent('indusmova:route', { detail: route }));
}

export function start() {
  window.addEventListener('hashchange', dispatch);
  // A bare /articles/<slug> has no fragment to normalise.
  if (!parsePath() && !window.location.hash) history.replaceState(null, '', '#/');
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
