import { getPref, setPref } from './store.js';
import { prefersReducedMotion } from './ui.js';

/** Theme selection is owned by global-theme.js on every route. This module
 * keeps only home-app reading comfort and progress behaviour. */
export function initTheme() {
  window.IndusTheme?.sync();
  const comfort = getPref('comfort', false);
  applyComfort(comfort);
  document.getElementById('comfortBtn')?.addEventListener('click', () => {
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

export { prefersReducedMotion };
