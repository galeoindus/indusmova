/* Indusmova — one theme controller for every route.
 * The value is stored in the same JSON format as store.js and is shared by
 * the home SPA, chat, research desk, static articles and utility pages.
 */
(() => {
  'use strict';
  const KEY = 'indusmova:theme';
  const MODES = ['auto', 'light', 'dark'];
  const ICONS = {
    auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    dark: '<path d="M20.5 15.4A8.5 8.5 0 0 1 8.6 3.5 8.5 8.5 0 1 0 20.5 15.4Z"/>',
  };
  const LABELS = { auto: 'System appearance', light: 'Light appearance', dark: 'Dark appearance' };
  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : { matches: false, addEventListener() {}, addListener() {} };

  function readMode() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw == null) return 'auto';
      let value = raw;
      try { value = JSON.parse(raw); } catch { /* legacy plain string */ }
      return MODES.includes(value) ? value : 'auto';
    } catch { return 'auto'; }
  }
  function writeMode(value) {
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* private mode */ }
  }
  function resolved(mode = readMode()) {
    return mode === 'auto' ? (media.matches ? 'dark' : 'light') : mode;
  }
  function syncButtons(mode, theme) {
    document.querySelectorAll('#themeBtn,[data-action="theme"],[data-theme-toggle]').forEach((button) => {
      const label = `${LABELS[mode]}. Activate to change theme.`;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.dataset.themeMode = mode;
      const svg = button.matches('#themeBtn')
        ? null
        : button.querySelector('svg[data-theme-icon],svg');
      if (svg) {
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = ICONS[mode];
      } else if (button.matches('#themeBtn')) {
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[mode]}</svg>`;
      }
    });
  }
  function paint() {
    const mode = readMode();
    const theme = resolved(mode);
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themeMode = mode;
    root.style.colorScheme = theme;
    const research = document.getElementById('research-app');
    if (research) research.dataset.theme = theme;
    const colour = theme === 'dark' ? '#0b1110' : '#f3f6f2';
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', colour));
    syncButtons(mode, theme);
    window.dispatchEvent(new CustomEvent('indusmova:themechange', { detail: { mode, theme } }));
    return { mode, theme };
  }
  function cycle() {
    const current = readMode();
    const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
    writeMode(next);
    return paint();
  }
  function addMissingControl() {
    if (document.querySelector('#themeBtn,[data-action="theme"],[data-theme-toggle]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'themeBtn';
    button.className = 'im-theme-toggle';
    button.setAttribute('aria-label', 'Change theme');
    button.title = 'Change theme';
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[readMode()]}</svg>`;
    // Pick the innermost suitable host: a selector list would return the first
    // match in document order, which is the outer header, not its inner row.
    const host = document.querySelector('.topbar-actions')
      || document.querySelector('.topbar-inner')
      || document.querySelector('.top-right')
      || document.querySelector('.topbar')
      || document.querySelector('.top')
      || document.body;
    host.append(button);
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('#themeBtn,[data-action="theme"],[data-theme-toggle]');
    if (!button) return;
    event.preventDefault();
    cycle();
  });
  window.addEventListener('storage', (event) => { if (event.key === KEY) paint(); });
  const mediaChange = () => { if (readMode() === 'auto') paint(); };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', mediaChange);
  else if (typeof media.addListener === 'function') media.addListener(mediaChange);
  document.addEventListener('DOMContentLoaded', () => { addMissingControl(); paint(); });
  window.IndusTheme = { paint, sync: paint, set(mode) { if (!MODES.includes(mode)) return paint(); writeMode(mode); return paint(); }, cycle, get mode() { return readMode(); } };
  // Resolve the theme before the first contentful paint, including on static pages.
  paint();
})();
