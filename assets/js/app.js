/* indusmova — application entry point.
 *
 * Builds the single context object every view receives, wires the header and
 * navigation controls, fills the discover rail, and hands routing to the hash
 * router. It is the only module index.html loads directly.
 */

import { SITE, CONTENT_LANGS, UI_LANGS } from './config.js';
import { SOURCE_LIST } from './sources.js';
import { updateRouteMetadata, setDocumentLang } from './meta.js';
import { t, setUiLang, applyI18n } from './i18n.js';
import * as api from './api.js';
import * as store from './store.js';
import { initTheme } from './theme.js';
import { el, clamp } from './ui.js';
import { toast, srcRow, trendRow } from './components.js';
import * as router from './router.js';
import { renderHome } from './views/home.js';
import { renderSearch } from './views/search.js';
import { renderAsk } from './views/ask.js';
import { renderArticle } from './views/article.js';
import { renderLibrary, renderWork } from './views/library.js';
import {
  renderExplore, renderToday, renderBookmarks, renderHistory,
  renderSources, renderTopics, renderStatic, renderSupport, renderFeedback, renderNotFound,
} from './views/pages.js';

/* --------------------------------------------------------------- the context */

// Listeners a view registers (store subscriptions, timers) are dropped before
// the next view renders, so nothing keeps running against a detached DOM.
let cleanups = [];

const prefs = store.getPrefs();

const ctx = {
  api,
  route: router.current(),
  state: {
    mode: prefs.mode,
    depth: prefs.depth,
    deepRank: prefs.deepRank,
    uiLang: prefs.uiLang,
    contentLang: prefs.contentLang,
  },
  t,
  navigate: (path) => router.navigate(path),
  onSubmit: (text, mode) => submit(text, mode),
  suggest: (q) => api.suggest(ctx.state.contentLang, q, { limit: 6 }),

  setMode(value) { ctx.state.mode = value; store.setPref('mode', value); },
  setDepth(value) { ctx.state.depth = value; store.setPref('depth', value); },
  toggleDeepRank(button) {
    ctx.state.deepRank = !ctx.state.deepRank;
    store.setPref('deepRank', ctx.state.deepRank);
    if (button) {
      button.classList.toggle('is-on', ctx.state.deepRank);
      button.setAttribute('aria-pressed', String(ctx.state.deepRank));
    }
    if (ctx.state.deepRank) toast(t('deepOn'));
  },
  setContentLang(code) {
    ctx.state.contentLang = code;
    store.setPref('contentLang', code);
    updateLangButton();
    toast(t('contentLangChanged', { lang: labelFor(code) }));
    clearViewCache();
    render(ctx.route, { fresh: true });
  },
  setUiLang(code) {
    setDocumentLang(code);
    ctx.state.uiLang = code;
    store.setPref('uiLang', code);
    setUiLang(code);
    applyI18n();
    updateLangButton();
    clearViewCache();
    render(ctx.route, { fresh: true });
  },

  on: store.on,
  onCleanup: (fn) => { cleanups.push(fn); },
  // The open view sets this so a depth / meaning change re-renders it at once.
  optionsChanged: () => {},
  // The open view sets this to re-arm itself when the reader comes back to it.
  viewRestore: null,

  getBookmarks: store.getBookmarks,
  isBookmarked: store.isBookmarked,
  toggleBookmark: store.toggleBookmark,
  removeBookmark: store.removeBookmark,
  clearBookmarks: store.clearBookmarks,
  getHistory: store.getHistory,
  pushHistory: store.pushHistory,
  clearHistory: store.clearHistory,
};

function labelFor(code) {
  return CONTENT_LANGS.find((l) => l.code === code)?.label || code;
}

function submit(text, mode) {
  const value = String(text || '').trim();
  if (!value) return;
  const useAsk = (mode || ctx.state.mode) === 'ask';
  if (mode) ctx.setMode(mode);
  const path = useAsk
    ? `/ask?q=${encodeURIComponent(value)}`
    : `/search?q=${encodeURIComponent(value)}`;
  router.navigate(path);
}

/* ------------------------------------------------------------------ routing */

const VIEWS = {
  home: (route) => renderHome(ctx, route),
  search: (route) => renderSearch(ctx, route),
  ask: (route) => renderAsk(ctx, route),
  article: (route) => renderArticle(ctx, route),
  explore: () => renderExplore(ctx),
  today: (route) => renderToday(ctx, route),
  bookmarks: () => renderBookmarks(ctx),
  history: () => renderHistory(ctx),
  sources: () => renderSources(ctx),
  topics: () => renderTopics(ctx),
  library: (route) => renderLibrary(ctx, route),
  work: (route) => renderWork(ctx, route),
  about: () => renderStatic('about'),
  privacy: () => renderStatic('privacy'),
  terms: () => renderStatic('terms'),
  accessibility: () => renderStatic('accessibility'),
  support: () => renderSupport(),
  feedback: () => renderFeedback(ctx),
  notfound: () => renderNotFound(),
};

/* ------------------------------------------------------- the view cache
 *
 * Going Back used to reload the article you had just left: the router saw a
 * new key, threw the old page away, showed the spinner and asked Wikimedia
 * for the same document again — losing the tab you were on, the section you
 * had scrolled to and the reading position itself. On a slow connection that
 * is a second wait for text that was already on the screen.
 *
 * So a rendered page is kept. Leaving a view detaches its node into this map
 * together with the scroll offset, the title and description it published and
 * a restore hook the view can supply; arriving back at that key puts the very
 * same node back on the page and scrolls to where the reader was. Nothing is
 * fetched, nothing is re-composed, no spinner appears.
 *
 * It is bounded, and it is not forever: at most a handful of pages, for
 * twenty minutes. A deliberately fresh render (`{ fresh: true }`, used when
 * the reader changes the source or interface language) skips it entirely.
 */
const VIEW_CACHE_MAX = 12;
const VIEW_CACHE_TTL = 45 * 60e3;
const viewCache = new Map(); // routeKey -> { node, scrollY, at, title, desc, restore }

// The page currently on screen, so it can be stashed when the reader leaves.
let openView = null; // { key, node, restore }

function stashOpenView() {
  if (!openView || !openView.node || !openView.node.isConnected) { openView = null; return; }
  const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  viewCache.set(openView.key, {
    node: openView.node,
    scrollY: window.scrollY || window.pageYOffset || 0,
    at: Date.now(),
    title: document.title,
    desc,
    restore: openView.restore,
  });
  // Keep the map small: the oldest entry goes first.
  if (viewCache.size > VIEW_CACHE_MAX) {
    const oldest = [...viewCache.entries()]
      .sort((a, b) => a[1].at - b[1].at)
      .slice(0, viewCache.size - VIEW_CACHE_MAX);
    for (const [key] of oldest) viewCache.delete(key);
  }
  openView = null;
}

/** Put a kept page back, exactly as it was. Returns true when it did. */
function restoreView(route, key, main) {
  const hit = viewCache.get(key);
  if (!hit) return false;
  if (Date.now() - hit.at > VIEW_CACHE_TTL || !hit.node) {
    viewCache.delete(key);
    return false;
  }
  viewCache.delete(key);

  document.documentElement.setAttribute('data-view', route.name);
  main.innerHTML = '';
  main.append(hit.node);
  markNav(route);
  // The view publishes its own title and description; put them back rather
  // than letting the generic route title overwrite an article's.
  updateRouteMetadata(route, { title: hit.title, description: hit.desc });
  document.title = hit.title;

  openView = { key, node: hit.node, restore: hit.restore };
  // A view that needs listeners re-attached to the restored DOM (the article
  // re-arms its contents button and its section watcher) does it here.
  if (typeof hit.restore === 'function') {
    try { hit.restore(); } catch (err) { console.error('restore failed', err); }
  }

  const tocBtn = document.getElementById('tocBtn');
  if (tocBtn) tocBtn.hidden = typeof ctx.toggleToc !== 'function';

  // The layout has to exist before a scroll offset can be applied to it, and
  // the jump has to be instant: the stylesheet sets `scroll-behavior: smooth`
  // on <html>, which `behavior: 'auto'` obeys — so restoring with 'auto'
  // animated the page down from the top every time the reader came back.
  const y = hit.scrollY;
  requestAnimationFrame(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    root.style.scrollBehavior = previous;
  });
  return true;
}

async function render(route, { fresh = false } = {}) {
  ctx.route = route;
  const key = router.routeKey(route);
  const main = document.getElementById('main');
  if (!main) return;

  // Keep the page being left before its cleanups run, so Back can have it.
  stashOpenView();

  for (const fn of cleanups.splice(0)) {
    try { fn(); } catch { /* a failed cleanup must not block the render */ }
  }
  ctx.optionsChanged = () => {};
  ctx.toggleToc = null;

  if (!fresh && restoreView(route, key, main)) return;

  if (fresh) viewCache.delete(key);

  document.documentElement.setAttribute('data-view', route.name);
  main.innerHTML = '';
  markNav(route);
  updateRouteMetadata(route);
  const view = VIEWS[route.name] || VIEWS.notfound;
  let node = null;
  try {
    node = await view(route);
    if (node) main.append(node);
  } catch (err) {
    console.error('view failed', err);
    main.append(el('div', { class: 'wrap-narrow', html: `<div class="error-box"><p><strong>${t('errorTitle')}</strong> ${t('errorBody')}</p></div>` }));
  }
  // The contents button only means something where the open view actually
  // built a contents rail. Before this it stayed in the header on every page
  // and answered a press with a "no sections here" toast — a dead control.
  const tocBtn = document.getElementById('tocBtn');
  if (tocBtn) tocBtn.hidden = typeof ctx.toggleToc !== 'function';

  // The view may hand back a restore hook for when this page is revisited.
  openView = { key, node: main.firstElementChild || node, restore: ctx.viewRestore || null };
  ctx.viewRestore = null;

  main.focus({ preventScroll: true });
  // A new page opens at the top immediately, not after a smooth scroll down
  // from wherever the reader was standing on the previous one.
  {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
  }
}

/** Forget every kept page. Used when the language of the content changes. */
function clearViewCache() {
  viewCache.clear();
  openView = null;
}

/**
 * Drop every kept page of a given view.
 *
 * A page built out of local data must not be served from the cache after that
 * data has changed. Saving an article from its own page and then pressing Back
 * was putting the old, empty Bookmarks list back on screen, because the copy
 * kept from the earlier visit was still the truth as far as the cache knew.
 */
function dropCachedView(name) {
  for (const key of [...viewCache.keys()]) {
    if (key.startsWith(`${name}:`)) viewCache.delete(key);
  }
}


function markNav(route) {
  // Compare normalised paths, not raw hrefs. The old check used
  // `href.endsWith(key)` with the home key reduced to "/", which is true for
  // every path that ends in a slash — so Topics, Help and every other
  // trailing-slash link lit up as "current" on the home page.
  const map = {
    home: '/', explore: '/explore', today: '/today', bookmarks: '/bookmarks',
    history: '/history', sources: '/sources', topics: '/topics', ask: '/ask',
    library: '/library',
  };
  const target = map[route.name] || null;
  document.querySelectorAll('.side-link, .topnav a, .bottom-nav a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const norm = (href.startsWith('#') ? href.slice(1) : href).replace(/\/+$/, '') || '/';
    const isActive = target != null && norm === target;
    if (isActive) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ------------------------------------------------------------- header wiring */

function updateLangButton() {
  const content = document.getElementById('langBtn');
  if (content) {
    content.textContent = ctx.state.contentLang.toUpperCase();
    // Name the setting, not just the value: the interface language and the
    // Wikipedia edition are two different things (report P1).
    const label = `${t('wikiEdition')}: ${labelFor(ctx.state.contentLang)}`;
    content.title = label;
    content.setAttribute('aria-label', label);
  }
  const ui = document.getElementById('uiLangBtn');
  if (ui) {
    // Show the language you would switch TO, not the one you are in.
    const other = UI_LANGS.find((l) => l.code !== ctx.state.uiLang) || UI_LANGS[0];
    ui.textContent = other.short;
    ui.title = `${t('uiLangTitle')} — ${other.label}`;
    ui.setAttribute('aria-label', `${t('uiLangTitle')} — ${other.label}`);
  }
}

function wireHeader() {
  document.getElementById('randomBtn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      const title = await api.random(ctx.state.contentLang);
      if (title) router.navigate(`/article/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    } catch {
      toast(t('errorBody'));
    } finally {
      btn.disabled = false;
    }
  });

  // The contents live in a rail beside the answer; this button shows or hides
  // that rail, which is also what its Close button does.
  document.getElementById('tocBtn')?.addEventListener('click', () => {
    // The open view decides what the contents button does; if there is no
    // contents panel here, say so rather than doing nothing.
    if (typeof ctx.toggleToc === 'function') ctx.toggleToc();
    else toast(t('noSectionsHere'));
  });

  document.getElementById('langBtn')?.addEventListener('click', (event) => openMenu(event.currentTarget, CONTENT_LANGS, ctx.state.contentLang, (code) => ctx.setContentLang(code), t('wikiEdition')));
  document.getElementById('uiLangBtn')?.addEventListener('click', (event) => openMenu(event.currentTarget, UI_LANGS.map((l) => ({ code: l.code, label: l.label })), ctx.state.uiLang, (code) => ctx.setUiLang(code), t('uiLangTitle')));

  // Keyboard shortcuts, as advertised in the tooltips.
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    if (event.key === '/') { event.preventDefault(); document.getElementById('searchInput')?.focus(); }
    if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) document.getElementById('randomBtn')?.click();
  });
}

let openMenuEl = null;
function openMenu(anchor, items, active, onPick, title = '') {
  closeMenu();
  const menu = el('div', { class: 'lang-menu', role: 'menu' });
  if (title) menu.append(el('p', { class: 'lang-menu-title', text: title }));
  for (const item of items) {
    const btn = el('button', {
      type: 'button', role: 'menuitemradio', class: `lang-menu-item${item.code === active ? ' is-active' : ''}`,
      text: item.label, 'aria-checked': String(item.code === active),
    });
    btn.addEventListener('click', () => { closeMenu(); onPick(item.code); });
    menu.append(btn);
  }
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  document.body.append(menu);
  openMenuEl = menu;
  setTimeout(() => document.addEventListener('click', onDocClick), 0);
  function onDocClick(event) {
    if (!menu.contains(event.target)) closeMenu();
  }
  menu._onDocClick = onDocClick;
}
function closeMenu() {
  if (openMenuEl) {
    document.removeEventListener('click', openMenuEl._onDocClick);
    openMenuEl.remove();
    openMenuEl = null;
  }
}

/* --------------------------------------------------------------- discover rail */

async function fillRail() {
  const rail = document.getElementById('appRail');
  if (!rail) return;
  const lang = ctx.state.contentLang;
  rail.innerHTML = '';
  rail.append(railSkeleton());

  try {
    const [rows, featured] = await Promise.all([
      api.mostRead(lang).catch(() => []),
      api.featured(lang).catch(() => ({ article: null })),
    ]);

    rail.innerHTML = '';

    // Today's wisdom — the opening line of a random article.
    const wisdom = featured.article || (rows[0] ? await api.summary(lang, rows[0].title).catch(() => null) : null);
    if (wisdom?.extract) {
      const card = el('div', { class: 'rail-card wisdom' });
      const head = el('div', { class: 'rail-head' });
      head.append(el('h3', { text: t('todaysWisdom') }));
      card.append(head);
      card.append(el('blockquote', { text: `“${clamp(wisdom.extract, 180)}”` }));
      card.append(el('cite', { text: `— ${wisdom.title}` }));
      rail.append(card);
    }

    // Trending
    if (rows.length) {
      const card = el('div', { class: 'rail-card' });
      const head = el('div', { class: 'rail-head' });
      head.append(el('h3', { text: t('trendingTopics') }));
      head.append(el('a', { class: 'rail-more', href: '#/today', html: `${esc(t('viewAll'))} →` }));
      card.append(head);
      rows.slice(0, 5).forEach((row, i) => card.append(trendRow(row, i + 1)));
      rail.append(card);
    }

    // Latest from sources
    const sources = el('div', { class: 'rail-card' });
    const head = el('div', { class: 'rail-head' });
    head.append(el('h3', { text: t('latestFromSources') }));
    head.append(el('a', { class: 'rail-more', href: '#/sources', html: `${esc(t('viewAll'))} →` }));
    sources.append(head);
    SOURCE_LIST.slice(0, 5).forEach((s) => sources.append(srcRow(s)));
    rail.append(sources);
  } catch {
    rail.innerHTML = '';
  }
}

function railSkeleton() {
  const card = el('div', { class: 'rail-card' });
  card.append(el('span', { class: 'sk-line sk-60' }));
  card.append(el('span', { class: 'sk-line sk-90' }));
  card.append(el('span', { class: 'sk-line sk-80' }));
  return card;
}

/* --------------------------------------------------------------------- boot */

function boot() {
  setUiLang(ctx.state.uiLang);
  // If the browser is blocking storage, say so rather than letting a reader
  // believe their saved answers will be there tomorrow (report P2).
  setTimeout(() => {
    if (!store.storageAvailable()) toast(`${t('storageTitle')} — ${t('storageBody')}`, { duration: 9000 });
  }, 1200);
  applyI18n();
  initTheme();
  updateLangButton();
  wireHeader();
  router.initLinkBehaviour();
  prefetchArticles();

  // #appVersion and #appBuild are painted by assets/js/build-watch.js from the
  // one authoritative /assets/version.json response. Writing SITE.version here
  // as well raced that fetch and could leave the footer showing a version that
  // was never deployed.
  const repo = document.getElementById('repoLink');
  if (repo) repo.href = SITE.repo;

  // A page built from local data is only as fresh as the data was. When the
  // reader saves, removes or clears something, drop the kept copies of the
  // views that show it, so going Back cannot show a list that has moved on.
  store.on('bookmarks', () => dropCachedView('bookmarks'));
  store.on('history', () => dropCachedView('history'));

  router.onChange((route) => render(route));
  router.start();
  fillRail();

  // The service worker is gone. Caching is done by _headers now — HTML
  // revalidates, versioned assets are immutable — and a worker on top of
  // that only ever did one thing here: keep an old build alive on a device
  // that had already visited. Old registrations are cleared below, once.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => (window.caches ? caches.keys() : Promise.resolve([])))
        .then((keys) => Promise.all((keys || []).map((k) => caches.delete(k))))
        .catch(() => undefined);
    });
  }

  // Reflect the reader's connection state in a thin strip.
  const strip = document.getElementById('statusStrip');
  const sync = () => {
    if (!strip) return;
    const offline = !navigator.onLine;
    strip.hidden = !offline;
    strip.textContent = offline ? t('offline') : '';
    strip.classList.toggle('is-warn', offline);
  };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

/* --------------------------------------------------------------- prefetch
 *
 * A card is a promise: the reader will most likely open it. Warming the
 * article the moment the pointer or the keyboard focus reaches the link means
 * the page they land on is painted from the API cache instead of waiting on
 * Wikimedia — and, together with the view cache, it is what makes Back feel
 * like a step backwards rather than a fresh page load.
 *
 * Nothing is fetched twice (the API cache answers the second call) and a
 * failed warm-up is swallowed: it is an optimisation, never a requirement.
 */
function prefetchArticles() {
  const seen = new Set();
  const warm = (anchor) => {
    let title;
    let params;
    try {
      const m = String(anchor.getAttribute('href') || '').match(/^#\/article\/([^?]+)(?:\?(.*))?$/);
      if (!m) return;
      title = decodeURIComponent(m[1]).replace(/_/g, ' ');
      params = new URLSearchParams(m[2] || '');
    } catch { return; }
    if (!title) return;
    const lang = params.get('lang') || ctx.state.contentLang;
    const project = params.get('project') || 'wikipedia';
    const key = `${lang}:${project}:${title}`;
    if (seen.has(key)) return;
    seen.add(key);
    api.article(lang, title, { project }).catch(() => {});
    api.pageImage(lang, title, { project }).catch(() => {});
  };
  const onEnter = (event) => {
    const anchor = event.target?.closest?.('a[href^="#/article/"]');
    if (anchor) warm(anchor);
  };
  document.addEventListener('pointerover', onEnter, { passive: true });
  document.addEventListener('focusin', onEnter);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

