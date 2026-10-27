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
 * now: ask the worker to update, reload at most once per session, and never
 * twice for the same build.
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
  stampBuild();
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
 * Say which build this is, in the footer, quietly.
 *
 * /assets/version.json is written on every push. The footer carried a version
 * string that had drifted two releases behind what was actually deployed, so
 * it now reads the stamp instead of a hard-coded value.
 */
async function stampBuild() {
  const versionEl = document.getElementById('appVersion');
  const buildEl = document.getElementById('appBuild');
  if (!versionEl && !buildEl) return;
  try {
    const res = await fetch(`/assets/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (versionEl && data.version) versionEl.textContent = `v${data.version}`;
    if (buildEl && data.commit) {
      buildEl.textContent = `· ${data.commit}`;
      buildEl.title = data.built ? `Built ${data.built}` : '';
    }
  } catch { /* the footer keeps whatever the markup says */ }
}

/**
 * Watch the build stamp — once, and only once per build.
 *
 * /assets/version.json is rewritten on every push and served no-store. The
 * page remembers the stamp it was loaded from and checks again when the tab
 * comes back into view. If the stamp has moved on, the page reloads itself,
 * but `sessionStorage` records that a reload already happened for that build,
 * so a page still being served from a slightly older copy cannot start a
 * reload loop — which is what produced the new / old / new flicker.
 *
 * The service worker is asked to check for its own update as well. It used to
 * be that the worker kept serving the previous app until the browser decided
 * to look, which is the other half of the stale-page problem.
 */
function initBuildWatch() {
  const SEEN = 'indusmova:build';
  const RELOADED = 'indusmova:reloaded-for';
  let reloading = false;

  // ask the worker to look for a new version now rather than in a day
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => undefined);
  }

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
