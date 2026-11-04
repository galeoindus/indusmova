/* indusmova — the whole article, in the reader's language.
 *
 * Wikipedia's own "translate this page" tool only ever machine-translates a
 * lead paragraph, so a reader who picks Hindi gets a summary of a summary.
 * This does the opposite: it takes the article that is already rendered on the
 * page — every heading, every paragraph, every list, every table cell and
 * every picture caption — and translates the *text inside it*, in place.
 *
 * Working on the live DOM rather than on a rebuilt page is the whole trick:
 * because only text nodes are replaced, the figures stay where they were, the
 * tables keep their shape, the infobox keeps its two columns, and the article
 * reads in the target language without being re-composed into something else.
 * Nothing is summarised, nothing is dropped, and nothing is invented — the
 * only thing that changes is the language.
 *
 * Two endpoints, both keyless and both already allowed by the site's CSP:
 * Google's gtx endpoint (fast, many languages) and MyMemory (slower, but it
 * answers when Google does not). Results are memoised for the session, so
 * going back to a language you have already read is instant.
 */

import { el } from './ui.js';
import { t } from './i18n.js';
import { WORLD_LANGS, langRecord, isRtlLang } from './world-langs.js';

const GOOGLE_BATCH = 'https://translate.googleapis.com/translate_a/t';
const GOOGLE_SINGLE = 'https://translate.googleapis.com/translate_a/single';
const MEMORY = 'https://api.mymemory.translated.net/get';

/** target|source-text -> translation. Survives tab switches, not reloads. */
const memo = new Map();
const memoKey = (target, text) => `${target}\u0000${text}`;

/** Elements whose text is not prose and must not be sent anywhere. */
const SKIP = 'script, style, code, pre, kbd, samp, var, math, svg, button, input, select, textarea, [aria-hidden="true"]';

/** True when a string is worth translating at all. */
function worthTranslating(text) {
  const value = String(text || '').trim();
  if (value.length < 2) return false;
  if (!/\p{L}/u.test(value)) return false;              // digits and punctuation only
  if (/^[\d\s.,;:%°+\-/()[\]]+$/u.test(value)) return false;
  return true;
}

/* ------------------------------------------------------------- endpoints */

/** Google's batch endpoint takes repeated `q` and answers one string per q. */
async function googleBatch(texts, target, signal) {
  const url = new URL(GOOGLE_BATCH);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', target);
  for (const text of texts) url.searchParams.append('q', text);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data) && data.length === texts.length) {
    return data.map((item) => (Array.isArray(item) ? String(item[0] ?? '') : String(item ?? '')));
  }
  throw new Error('translate shape');
}

/** One request, one string — the shape both fallbacks agree on. */
async function googleSingle(text, target, signal) {
  const url = new URL(GOOGLE_SINGLE);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = await res.json();
  const parts = data?.[0];
  if (!Array.isArray(parts)) throw new Error('translate shape');
  return parts.map((p) => (Array.isArray(p) ? p[0] : '')).join('');
}

/** MyMemory answers when Google's keyless endpoint is rate-limited. */
async function myMemory(text, target, signal) {
  const url = new URL(MEMORY);
  url.searchParams.set('q', text.slice(0, 480));
  url.searchParams.set('langpair', `en|${String(target).split('-')[0]}`);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`mymemory ${res.status}`);
  const data = await res.json();
  const out = data?.responseData?.translatedText;
  if (!out || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) throw new Error('mymemory refused');
  return out;
}

/**
 * Translate a list of strings, in order, with the answer for each.
 *
 * Batching keeps a long article to a handful of requests. If the batch call
 * fails the same texts go one at a time; if Google refuses entirely, MyMemory
 * is tried. A single string that still fails comes back as `null` so the
 * caller can leave that passage in the original language rather than showing
 * a blank or a guess.
 */
async function translateMany(texts, target, signal) {
  const out = new Array(texts.length).fill(null);
  const pending = [];

  texts.forEach((text, index) => {
    const hit = memo.get(memoKey(target, text));
    if (hit != null) out[index] = hit;
    else pending.push({ index, text });
  });
  if (!pending.length) return out;

  const apply = (index, text, value) => {
    if (typeof value !== 'string' || !value.trim()) return false;
    out[index] = value;
    memo.set(memoKey(target, text), value);
    return true;
  };

  // One batched call per group of twenty, run one group at a time so the
  // progress count the reader sees is honest and the endpoint is not flooded.
  const GROUP = 20;
  for (let start = 0; start < pending.length; start += GROUP) {
    const slice = pending.slice(start, start + GROUP);
    if (signal?.aborted) break;
    try {
      const answers = await googleBatch(slice.map((p) => p.text), target, signal);
      slice.forEach((p, i) => apply(p.index, p.text, answers[i]));
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // Fall through to the per-string path below.
      for (const p of slice) {
        if (signal?.aborted) break;
        try {
          apply(p.index, p.text, await googleSingle(p.text, target, signal));
        } catch (inner) {
          if (inner?.name === 'AbortError') throw inner;
          try { apply(p.index, p.text, await myMemory(p.text, target, signal)); }
          catch (last) { if (last?.name === 'AbortError') throw last; /* leave null */ }
        }
      }
    }
  }
  return out;
}

/* -------------------------------------------------------- the DOM walk */

/** Every text node under `root` that holds translatable prose. */
function collectTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return worthTranslating(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node = walker.nextNode();
  while (node) { nodes.push(node); node = walker.nextNode(); }
  return nodes;
}

/**
 * Translate a detached article fragment in place.
 *
 * Text is replaced node by node, so `<b>`, links, `<sup>` citation markers and
 * everything structural survive exactly as they were. `onProgress` is called
 * with (done, total) after every batch.
 */
export async function translateFragment(root, target, { signal, onProgress } = {}) {
  const nodes = collectTextNodes(root);
  if (!nodes.length) return { translated: 0, failed: 0, total: 0 };

  // Preserve the whitespace either side of each string, so inline text does
  // not run together after translation.
  const payload = nodes.map((node) => node.nodeValue.trim());
  const leads = nodes.map((node) => (/^\s/.test(node.nodeValue) ? ' ' : ''));
  const trails = nodes.map((node) => (/\s$/.test(node.nodeValue) ? ' ' : ''));

  const results = await translateMany(payload, target, signal);

  let translated = 0;
  let failed = 0;
  results.forEach((value, i) => {
    if (value == null) { failed += 1; return; }
    nodes[i].nodeValue = `${leads[i]}${value}${trails[i]}`;
    translated += 1;
  });

  // Alt text and titles are part of the article too — a screen-reader user
  // should hear the picture described in the language they chose.
  const attrs = [];
  root.querySelectorAll('img[alt], [title]').forEach((node) => {
    if (node.closest(SKIP)) return;
    const alt = node.getAttribute('alt');
    if (alt && worthTranslating(alt)) attrs.push({ node, name: 'alt', text: alt });
    const title = node.getAttribute('title');
    if (title && worthTranslating(title)) attrs.push({ node, name: 'title', text: title });
  });
  if (attrs.length) {
    const answers = await translateMany(attrs.map((a) => a.text), target, signal).catch(() => []);
    answers.forEach((value, i) => { if (value) attrs[i].node.setAttribute(attrs[i].name, value); });
  }

  if (onProgress) onProgress(nodes.length, nodes.length);
  return { translated, failed, total: nodes.length };
}

/* ------------------------------------------------------------- the panel */

/**
 * The Translate tab: pick a language, translate the whole article, read it.
 *
 * The source is the article's own Full-article panel — the one the reader is
 * already looking at — cloned so the original is never touched.
 */
export function translatePanel(state) {
  const panel = el('div', { class: 'tr-panel' });

  const bar = el('div', { class: 'tr-bar' });
  const label = el('label', { class: 'tr-pick', for: 'trLang' });
  label.append(el('span', { text: t('translatePick') }));

  const select = el('select', { id: 'trLang', class: 'tr-select', 'aria-label': t('translatePick') });
  // Grouped so a reader can find their own language without scrolling a
  // hundred entries: India first, then the world.
  const groups = [
    { label: t('translateIndia'), items: WORLD_LANGS.slice(0, 31) },
    { label: t('translateWorld'), items: WORLD_LANGS.slice(31) },
  ];
  for (const group of groups) {
    const optgroup = el('optgroup', { label: group.label });
    for (const lang of group.items) {
      const option = el('option', { value: lang.code });
      option.textContent = `${lang.native} — ${lang.name}`;
      optgroup.append(option);
    }
    select.append(optgroup);
  }
  // Sensible default: a reader on an English article most likely wants their
  // own language; a reader already in Hindi most likely wants English.
  const preferred = String(state?.lang || 'en').toLowerCase().startsWith('en') ? 'hi' : 'en';
  select.value = preferred;
  label.append(select);
  bar.append(label);

  const run = el('button', { type: 'button', class: 'btn btn-primary', text: t('translateStart') });
  const stop = el('button', { type: 'button', class: 'btn btn-ghost', text: t('stopReading'), hidden: true });
  bar.append(run, stop);
  panel.append(bar);

  const status = el('p', { class: 'tr-status', role: 'status', 'aria-live': 'polite' });
  status.textContent = t('translateEmpty');
  panel.append(status);

  const track = el('div', { class: 'tr-track', 'aria-hidden': 'true' }, [el('span')]);
  track.hidden = true;
  panel.append(track);

  const body = el('div', { class: 'tr-body' });
  panel.append(body);

  let controller = null;

  const setBusy = (busy) => {
    run.disabled = busy;
    select.disabled = busy;
    stop.hidden = !busy;
    track.hidden = !busy;
    run.textContent = busy ? t('translateWorking') : t('translateStart');
  };

  run.addEventListener('click', async () => {
    const source = state?.fullMount?.querySelector('.panel-wide');
    if (!source) { status.textContent = t('translateFailed'); return; }

    const target = select.value;
    const record = langRecord(target);
    controller = new AbortController();
    setBusy(true);
    body.replaceChildren();
    status.textContent = `${t('translateWorking')} — ${record.native}`;
    track.querySelector('span').style.width = '4%';

    const clone = source.cloneNode(true);
    // Interactive chrome has no business inside a reading copy.
    clone.querySelectorAll('button, .md-disclosure, .fb-row, .toc-jump, [role="status"]').forEach((n) => n.remove());

    try {
      const result = await translateFragment(clone, target, {
        signal: controller.signal,
        onProgress: (done, total) => {
          const pct = total ? Math.round((done / total) * 100) : 100;
          track.querySelector('span').style.width = `${Math.max(4, pct)}%`;
          status.textContent = `${t('translateWorking')} — ${record.native} · ${done}/${total}`;
        },
      });

      body.setAttribute('lang', target);
      body.setAttribute('dir', isRtlLang(target) ? 'rtl' : 'ltr');

      const note = el('div', { class: 'tr-note' });
      note.append(el('p', {
        html: `<strong>${esc(t('translateDone'))}</strong> ${esc(t('translateNote', { lang: record.native }))}`,
      }));
      if (result.failed) {
        note.append(el('p', { class: 'tr-partial', text: t('translatePartial', { count: String(result.failed) }) }));
      }
      const again = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: t('translateAgain') });
      again.addEventListener('click', () => run.click());
      note.append(again);
      body.append(note, clone);

      status.textContent = `${t('translateDone')} — ${record.native}`;
      track.querySelector('span').style.width = '100%';
    } catch (err) {
      if (err?.name === 'AbortError') status.textContent = t('translateCancelled');
      else status.textContent = t('translateFailed');
    } finally {
      controller = null;
      setBusy(false);
      track.hidden = true;
    }
  });

  stop.addEventListener('click', () => { if (controller) controller.abort(); });

  return { panel, abort: () => controller?.abort() };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
