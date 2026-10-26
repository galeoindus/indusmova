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
import { renderChat, toggleChatDock, closeChatDock } from './views/chat.js';
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
    render(ctx.route);
  },
  setUiLang(code) {
    setDocumentLang(code);
    ctx.state.uiLang = code;
    store.setPref('uiLang', code);
    setUiLang(code);
    applyI18n();
    updateLangButton();
    render(ctx.route);
  },

  on: store.on,
  onCleanup: (fn) => { cleanups.push(fn); },
  // The open view sets this so a depth / meaning change re-renders it at once.
  optionsChanged: () => {},

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
  chat: () => renderChat(ctx),
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

async function render(route) {
  ctx.route = route;
  for (const fn of cleanups.splice(0)) {
    try { fn(); } catch { /* a failed cleanup must not block the render */ }
  }
  ctx.optionsChanged = () => {};
  const main = document.getElementById('main');
  if (!main) return;
  document.documentElement.setAttribute('data-view', route.name);
  main.innerHTML = '';
  markNav(route);
  updateRouteMetadata(route);
  const view = VIEWS[route.name] || VIEWS.notfound;
  try {
    const node = await view(route);
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

  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
}


function markNav(route) {
  // Compare normalised paths, not raw hrefs. The old check used
  // `href.endsWith(key)` with the home key reduced to "/", which is true for
  // every path that ends in a slash — so Topics, Help and every other
  // trailing-slash link lit up as "current" on the home page.
  const map = {
    home: '/', explore: '/explore', today: '/today', bookmarks: '/bookmarks',
    history: '/history', sources: '/sources', topics: '/topics', ask: '/ask',
    chat: '/chat', library: '/library',
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

  // The chat lives beside every page as a dock, and has its own route.
  document.getElementById('chatBtn')?.addEventListener('click', () => toggleChatDock(ctx));
  document.getElementById('chatFab')?.addEventListener('click', () => toggleChatDock(ctx));
  router.onChange(() => closeChatDock());

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

/**
 * Show which build this is, and get out of the way of a stale one.
 *
 * Two problems meet here. A reader had no way to tell an updated site from a
 * cached old one, and a cached old shell could keep showing a design that had
 * already been fixed. The build stamp is written on every commit, so if the
 * stamp we are running does not match the one on the server, the caches are
 * cleared and the page is reloaded once.
 */
async function checkBuild() {
  const shown = document.getElementById('appVersion');
  const buildNode = document.getElementById('appBuild');
  try {
    const res = await fetch(`/assets/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const info = await res.json();
    const label = `v${info.version}${info.commit && info.commit !== 'dev' ? `+${info.commit}` : ''}`;
    if (shown) shown.textContent = label;
    if (buildNode && info.built) {
      const when = new Date(info.built);
      buildNode.textContent = Number.isNaN(when.getTime())
        ? ''
        : `· ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(when)}`;
      buildNode.title = t('buildStampTitle');
    }
    document.querySelector('meta[name="indusmova-version"]')?.setAttribute('content', label);

    const seen = localStorage.getItem('indusmova:build');
    localStorage.setItem('indusmova:build', String(info.commit || ''));
    // A newer build on the server while an older one is running: refresh once.
    if (seen && info.commit && seen !== info.commit && !sessionStorage.getItem('indusmova:reloaded')) {
      sessionStorage.setItem('indusmova:reloaded', '1');
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      location.reload();
    }
  } catch {
    /* offline, or the stamp is missing: the app still works */
  }
}

function boot() {
  setUiLang(ctx.state.uiLang);
  checkBuild();
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

  const version = document.getElementById('appVersion');
  if (version) version.textContent = SITE.version;
  const repo = document.getElementById('repoLink');
  if (repo) repo.href = SITE.repo;

  router.onChange((route) => render(route));
  router.start();
  fillRail();

  // Register the service worker for offline use, but never block on it.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
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

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

