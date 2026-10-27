/* indusmova — theme and reading comfort.
 *
 * The page ships with data-theme="dark" and data-comfort="auto" in the markup
 * so the first paint is already right; this module takes over from there.
 * Theme cycles auto -> light -> dark, stored per device. Comfort (opaque
 * surfaces) is a separate boolean. A reading-progress bar is updated on scroll.
 *
 * It also watches the build stamp — carefully. An earlier version reloaded on
 * the stamp changing AND again when the service worker took over, so a reader
 * could see the new page, then the old one, then the new one again. The rule
 * now: at most one reload per session, and never while a reload is already
 * under way.
 */

import { getPref, setPref } from './store.js';
import { prefersReducedMotion } from './ui.js';

const THEMES = ['auto', 'light', 'dark'];
const ICON = {
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9c0-.5-.4-.9-.9-.9a7 7 0 0 1-7.2-7.2c0-.5-.4-.9-.9-.9z"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9c0-.5-.4-.9-.9-.9a7 7 0 0 1-7.2-7.2c0-.5-.4-.9-.9-.9z"/></svg>',
};
const TITLE = {
  auto: 'Following the system theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

const media = window.matchMedia('(prefers-color-scheme: dark)');
let currentTheme = getPref('theme', 'auto');

function effective(theme) {
  return theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme;
}

function paint() {
  const html = document.documentElement;
  html.setAttribute('data-theme', effective(currentTheme));
  const bg = effective(currentTheme) === 'dark' ? '#101713' : '#f5f0e6';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.innerHTML = ICON[currentTheme];
    btn.title = TITLE[currentTheme];
    btn.setAttribute('aria-label', TITLE[currentTheme]);
  }
}

export function initTheme() {
  paint();
  media.addEventListener('change', () => { if (currentTheme === 'auto') paint(); });

  document.getElementById('themeBtn')?.addEventListener('click', () => {
    currentTheme = THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length];
    setPref('theme', currentTheme);
    paint();
  });

  const comfort = getPref('comfort', false);
  applyComfort(comfort);
  document.getElementById('comfortBtn')?.addEventListener('click', () => {
    // The stylesheet switches on `data-comfort="opaque"`; writing "on" here
    // meant the button flipped an attribute no rule listened to, so the
    // control did nothing at all.
    const next = document.documentElement.getAttribute('data-comfort') !== 'opaque';
    setPref('comfort', next);
    applyComfort(next);
  });

  initProgress();
  initGaleoindusLink();
  initBuildWatch();
}

function applyComfort(on) {
  document.documentElement.setAttribute('data-comfort', on ? 'opaque' : 'auto');
  const btn = document.getElementById('comfortBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-on', on);
  }
}

function initProgress() {
  const bar = document.getElementById('readBar');
  if (!bar) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0;
    bar.style.width = `${pct}%`;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

export function getTheme() {
  return currentTheme;
}

/**
 * Galeoindus — the chat page — in the site's own navigation.
 *
 * The chat lives at /chat/ as a page of its own. Rather than editing the
 * markup of every page, the link is added once at boot to whichever
 * navigation the current page has: the top bar and the side rail on the
 * app, and nothing where there is no navigation. It is skipped if a link
 * is already in the markup, so a page that carries one never gets two.
 */
function initGaleoindusLink() {
  const HREF = '/chat/';

  const top = document.querySelector('.topnav');
  if (top && !top.querySelector(`a[href="${HREF}"]`)) {
    const a = document.createElement('a');
    a.href = HREF;
    a.textContent = 'Galeoindus';
    a.title = 'Galeoindus — chat';
    const sep = top.querySelector('.nav-sep');
    if (sep) top.insertBefore(a, sep);
    else top.append(a);
  }

  const side = document.querySelector('.app-side');
  if (side && !side.querySelector(`a[href="${HREF}"]`)) {
    const a = document.createElement('a');
    a.className = 'side-link';
    a.href = HREF;
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"></path></svg>'
      + '<span>Galeoindus</span>';
    const ask = [...side.querySelectorAll('.side-link')].find((l) => l.getAttribute('href') === '#/ask');
    if (ask && ask.nextSibling) side.insertBefore(a, ask.nextSibling);
    else side.insertBefore(a, side.querySelector('.side-heading + .side-link') || side.firstChild);
  }
}

/**
 * Watch the build stamp — once.
 *
 * /assets/version.json is rewritten on every push and is served no-store.
 * The page remembers the stamp it was loaded from and checks again when the
 * tab comes back into view. If the stamp has moved on, the page reloads
 * itself, but only once per session: `sessionStorage` records that a reload
 * already happened for that stamp, so a page that is still being served from
 * a slightly older copy cannot start a reload loop — which is exactly what
 * produced the new / old / new flicker.
 *
 * Nothing here listens to the service worker. The worker already takes over
 * immediately; asking the page to reload on top of that was the second
 * reload in the loop.
 */
function initBuildWatch() {
  const SEEN = 'indusmova:build';
  const RELOADED = 'indusmova:reloaded-for';
  let reloading = false;

  const check = async () => {
    if (reloading || document.visibilityState !== 'visible') return;

    let stamp = '';
    try {
      const res = await fetch(`/assets/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      stamp = `${data.version || ''}+${data.commit || ''}`;
    } catch { return; }
    if (!stamp || stamp === '+') return;

    let seen = null;
    let reloadedFor = null;
    try {
      seen = localStorage.getItem(SEEN);
      reloadedFor = sessionStorage.getItem(RELOADED);
    } catch { return; }

    // first visit on this device: just remember the build
    if (!seen) {
      try { localStorage.setItem(SEEN, stamp); } catch { /* ignore */ }
      return;
    }
    if (seen === stamp) return;

    // the build has moved on. Reload once, and only once, per session.
    try { localStorage.setItem(SEEN, stamp); } catch { /* ignore */ }
    if (reloadedFor === stamp) return;
    try { sessionStorage.setItem(RELOADED, stamp); } catch { /* ignore */ }
    reloading = true;
    location.reload();
  };

  // let the page finish painting before the first check
  if (document.readyState === 'complete') setTimeout(check, 1200);
  else window.addEventListener('load', () => setTimeout(check, 1200), { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

export { prefersReducedMotion };
