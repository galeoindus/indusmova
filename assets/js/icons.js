/* indusmova — the icon set.
 *
 * Every icon is a plain SVG string so it can be dropped into innerHTML or an
 * `html` template. Stroke icons inherit `currentColor`; the two brand marks
 * are filled. Keeping them here means one file to edit when a glyph changes.
 */

const S = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

const F = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  home: S('<path d="M4 11.5 12 4l8 7.5M6 10v9h12v-9"/>'),
  ask: S('<path d="M12 20a8 8 0 1 0-7.5-10.7M12 20v-5m0-2.5V9"/>'),
  explore: S('<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  today: S('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3.5V6m8-2.5V6"/>'),
  saved: S('<path d="M6.5 4h11v16l-5.5-4-5.5 4z"/>'),
  bookmark: S('<path d="M6 3h12v18l-6-4.5L6 21z"/>'),
  topics: S('<path d="M12 4 3.5 8.5 12 13l8.5-4.5z"/><path d="m4 12.5 8 4.5 8-4.5"/>'),
  sources: S('<ellipse cx="12" cy="6.5" rx="7.5" ry="3"/><path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11"/>'),
  history: S('<path d="M12 7v5l3.5 2"/><circle cx="12" cy="12" r="8.5"/>'),
  random: F('<path d="M17 3h4v4h-2V6.4l-4.3 4.3-1.4-1.4L17.6 5H17V3zM3 17v-2h1.6l4.3-4.3 1.4 1.4L6 16.4V17H3zm14 0v-1.6l-4.3-4.3 1.4-1.4L18.4 15H20v2h-3zM3 5h3v1.6L10.3 11l-1.4 1.4L5 8.4V7H3V5z"/>'),
  mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  comfort: S('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M3 15h18"/>'),
  theme: F('<path d="M12 3a9 9 0 1 0 9 9c0-.5-.4-.9-.9-.9a7 7 0 0 1-7.2-7.2c0-.5-.4-.9-.9-.9z"/>'),
  plus: S('<path d="M12 3v18M3 12h18"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  search: S('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  chevron: S('<path d="m9 6 6 6-6 6"/>'),
  arrow: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  external: S('<path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  check: S('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  copy: S('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
  download: S('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>'),
  trash: S('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>'),
  share: S('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>'),
  info: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
  warn: S('<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>'),
  sparkle: F('<path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2zM9 21h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1z"/>'),
  flask: S('<path d="M9 3h6v2h-1v5.6l4.6 7.9A2 2 0 0 1 16.9 22H7.1a2 2 0 0 1-1.7-3.5L10 10.6V5H9V3z"/>'),
  book: S('<path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V4zm16 0h-5a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h5V4z"/>'),
  globe: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z"/>'),
  leaf: S('<path d="M5 21c0-8 5-15 14-16 1 10-4 15-10 15-1.4 0-2.7-.3-4-1zm2.3-1.4C11 18 14.4 15 16 11c-3 3.6-6.5 5.6-8.7 8.6z"/>'),
  planet: S('<circle cx="12" cy="12" r="7"/><path d="M3 15c2 1.5 8-4 16-1"/>'),
  culture: S('<path d="M3 5h18v3a9 9 0 0 1-9 9 9 9 0 0 1-9-9V5zm4 3v3h2V8H7zm8 0v3h2V8h-2z"/>'),
  math: S('<path d="M6 4h12v2.5l-6 5.5 6 5.5V20H6v-2h8l-5-4.6L14 8.8H6V4z"/>'),
  chip: S('<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
  list: S('<path d="M4 5h16M4 12h16M4 19h10"/>'),
  toc: S('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  quote: F('<path d="M7 7h4v4c0 3-1.8 5-4.5 5.6l-.5-1.6C7.6 14.5 8 13.6 8 12H7V7zm8 0h4v4c0 3-1.8 5-4.5 5.6L14 15c1.6-.5 2-1.4 2-3h-1V7z"/>'),
};

/** Brand mark — the two-wave "river" glyph used in the topbar and footer. */
export const BRAND_MARK = `<svg viewBox="0 0 40 40"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#173b32"/><stop offset="1" stop-color="#b46a45"/></linearGradient></defs><rect width="40" height="40" rx="12" fill="url(#bm)"/><rect x="6.6" y="6.6" width="26.8" height="26.8" rx="6.2" fill="none" stroke="#f5f0e6" stroke-opacity=".32" stroke-width="1.3"/><g fill="none" stroke="#f5f0e6" stroke-width="2.7" stroke-linecap="round"><path d="M10.2 16.5c2.85-3.5 5.7-3.5 8.55 0s5.7 3.5 8.55 0"/><path d="M12.4 23.5c2.85-3.5 5.7-3.5 8.55 0s5.7 3.5 8.55 0"/></g></svg>`;

/** Placeholder mark for a card with no picture. */
export const PLACEHOLDER_MARK = `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#173b32"/><rect x="6.6" y="6.6" width="26.8" height="26.8" rx="6.2" fill="none" stroke="#f5f0e6" stroke-opacity=".32" stroke-width="1.3"/><g fill="none" stroke="#f5f0e6" stroke-width="2.7" stroke-linecap="round"><path d="M10.2 16.5c2.85-3.5 5.7-3.5 8.55 0s5.7 3.5 8.55 0"/><path d="M12.4 23.5c2.85-3.5 5.7-3.5 8.55 0s5.7 3.5 8.55 0"/></g></svg>`;

export function icon(name, extra = '') {
  return ICONS[name] || '';
}
