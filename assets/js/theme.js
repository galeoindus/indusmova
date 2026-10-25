/* indusmova — theme and reading comfort.
 *
 * The page ships with data-theme="dark" and data-comfort="auto" in the markup
 * so the first paint is already right; this module takes over from there.
 * Theme cycles auto -> light -> dark, stored per device. Comfort (opaque
 * surfaces) is a separate boolean. A reading-progress bar is updated on scroll.
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

export { prefersReducedMotion };
