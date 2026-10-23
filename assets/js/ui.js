/* indusmova — small DOM and formatting helpers used everywhere.
 *
 * Deliberately tiny: build a node from a tag/attrs/children, escape text, and
 * format the few numbers and dates the interface shows. No framework.
 */

/** Escape text for safe insertion into HTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Create an element. attrs may include `class`, `html`, `text`, `on`. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'on') for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Strip any HTML tags from a string and collapse whitespace. */
export function stripTags(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncate on a word boundary and add an ellipsis. */
export function clamp(value, max = 160) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[.,;:\s]+$/, '') + '…';
}

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
/** 278800 -> "278.8k". Used for view counts in the trend rail. */
export function compactNumber(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  return COMPACT.format(value).toLowerCase();
}

/** "Fri 23 Oct · New Delhi" — the hero clock line. */
export function clockParts(date = new Date()) {
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    zone = zone.split('/').pop().replace(/_/g, ' ');
  } catch {
    zone = '';
  }
  return { time, day, zone };
}

/** Debounce, trailing edge. */
export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Strip tracking parameters Wikimedia's thumbnail host sometimes carries. */
export function cleanUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_')) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
