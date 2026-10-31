/* indusmova — the floating chat launcher.
 *
 * One control, bottom-left, on every page except the chat itself: a tap goes
 * straight to /chat/. It carries its own styles so it works on the app shell,
 * the static pages and the Research Desk without any of them having to know
 * about it.
 *
 * It stays out of the way: it does not cover the composer, it hides while
 * printing, and it respects reduced motion.
 */
(() => {
  if (document.getElementById('im-chat-launcher')) return;
  if (location.pathname.replace(/\/+$/, '') === '/chat') return;

  const style = document.createElement('style');
  style.textContent = `
  .im-launcher {
    position: fixed;
    right: max(16px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom));
    z-index: 9000;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 11px 16px 11px 13px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 999px;
    background: linear-gradient(135deg, #173b32, #b46a45);
    color: #f7f4ec;
    font: 600 13.5px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    text-decoration: none;
    box-shadow: 0 12px 30px -12px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.25);
    cursor: pointer;
    transition: transform .16s ease, box-shadow .16s ease, opacity .16s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .im-launcher:hover { transform: translateY(-2px); box-shadow: 0 18px 38px -14px rgba(0,0,0,.65); }
  .im-launcher:active { transform: translateY(0) scale(.985); }
  .im-launcher:focus-visible { outline: 2px solid #f7f4ec; outline-offset: 3px; }
  .im-launcher svg { width: 17px; height: 17px; flex: none; }
  .im-launcher .im-lbl { white-space: nowrap; }
  .im-launcher .im-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #7fe0b0; box-shadow: 0 0 0 3px rgba(127,224,176,.22);
    flex: none;
  }
  @media (max-width: 520px) {
    .im-launcher { padding: 12px; gap: 0; }
    .im-launcher .im-lbl, .im-launcher .im-dot { display: none; }
  }
  @media print { .im-launcher { display: none; } }
  @media (prefers-reduced-motion: reduce) {
    .im-launcher { transition: none; }
    .im-launcher:hover { transform: none; }
  }`;
  document.head.append(style);

  const link = document.createElement('a');
  link.id = 'im-chat-launcher';
  link.className = 'im-launcher';
  link.href = '/chat/';
  link.setAttribute('aria-label', 'Open the AI chat');
  link.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 11.6a8.4 8.4 0 0 1-9 8.4 9.2 9.2 0 0 1-3.4-.7L3 21l1.6-4.6A8.2 8.2 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.6Z"></path>
    </svg>
    <span class="im-dot" aria-hidden="true"></span>
    <span class="im-lbl">Ask AI</span>`;

  // A shortcut that does not fight the page's own keys.
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      location.href = '/chat/';
    }
  });

  const mount = () => document.body.append(link);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
