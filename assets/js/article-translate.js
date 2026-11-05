/* indusmova — the whole article, in the reader's language.
 *
 * Wikipedia's own "translate this page" tool only ever machine-translates a
 * lead paragraph, so a reader who picks Hindi gets a summary of a summary.
 * This does the opposite: it translates every heading, paragraph, list, table
 * cell and picture caption of the article — in place.
 *
 * Working on the live DOM rather than on a rebuilt page is the whole trick:
 * because only text nodes are replaced, the figures stay where they were, the
 * tables keep their shape, the infobox keeps its two columns, and the article
 * reads in the target language without being re-composed into something else.
 *
 * Three things this is careful about, because a reader has to be able to trust
 * the result:
 *
 *   Source edition. "Translate the English original" resolves through the
 *   article's own interlanguage links, so the same subject gives the same
 *   English page whatever edition you arrived from. When no English page
 *   exists, the current edition is offered and labelled as such.
 *
 *   Disclosure. The text leaves the browser for a translation service. That is
 *   said on the panel itself, before anything is sent, not buried in a policy.
 *
 *   Honesty about failure. A passage the provider could not translate keeps its
 *   original text and is marked, never blanked and never passed off as
 *   translated.
 */

import { el, esc } from './ui.js';
import { t } from './i18n.js';
import { WORLD_LANGS, langRecord, isRtlLang } from './world-langs.js';
import { translateTexts } from './translate-provider.js';
import { clean } from './parse.js';

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
 * everything structural survive exactly as they were. A node the provider
 * could not translate keeps its original text and is marked with
 * `data-untranslated`, so the reader can see what is still in the source
 * language instead of silently reading a half-translated page.
 */
export async function translateFragment(root, target, { source = 'auto', signal, onProgress } = {}) {
  const nodes = collectTextNodes(root);
  if (!nodes.length) return { translated: 0, failed: 0, total: 0, failedNodes: [] };

  // Preserve the whitespace either side of each string, so inline text does
  // not run together after translation.
  const payload = nodes.map((node) => node.nodeValue.trim());
  const leads = nodes.map((node) => (/^\s/.test(node.nodeValue) ? ' ' : ''));
  const trails = nodes.map((node) => (/\s$/.test(node.nodeValue) ? ' ' : ''));

  const results = await translateTexts(payload, target, { source, signal, onProgress });

  let translated = 0;
  const failedNodes = [];
  results.forEach((result, i) => {
    if (result.status !== 'translated') {
      // Keep the original words on screen, and say so in the markup.
      nodes[i].parentElement?.setAttribute('data-untranslated', 'true');
      failedNodes.push(i);
      return;
    }
    nodes[i].nodeValue = `${leads[i]}${result.text}${trails[i]}`;
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
    const answers = await translateTexts(attrs.map((a) => a.text), target, { source, signal }).catch(() => []);
    answers.forEach((result, i) => {
      if (result?.status === 'translated') attrs[i].node.setAttribute(attrs[i].name, result.text);
    });
  }

  onProgress?.(nodes.length, nodes.length);
  return { translated, failed: failedNodes.length, total: nodes.length, failedNodes };
}

/* --------------------------------------------------------- source edition */

/** The English title for this article, via its own interlanguage links. */
function englishTitle(state) {
  const links = state?.data?.langlinks || [];
  const en = links.find((l) => String(l?.lang || '').toLowerCase() === 'en');
  return en?.title || (String(state?.lang || '').toLowerCase() === 'en' ? state?.data?.title : '') || '';
}

/* ------------------------------------------------------------- the panel */

/**
 * The Translate tab: pick a language, translate the whole article, read it.
 *
 * The source is either the English original (resolved through the article's
 * interlanguage links) or the edition on screen. Both are cloned, so the page
 * the reader is looking at is never touched.
 */
export function translatePanel(state, ctx) {
  const panel = el('div', { class: 'tr-panel', dataset: { state: 'choosing' } });

  const enTitle = englishTitle(state);
  const onEnglish = String(state?.lang || '').toLowerCase().startsWith('en');

  /* ── 1. the language chooser ────────────────────────────────────────────
   * The tab opens on the languages themselves. A reader presses Translate to
   * read the article in their language, so the list of languages is the
   * first thing on the panel and picking one is the whole action: no second
   * button, no dropdown to open first, no "translate" step after the choice.
   */
  const choose = el('div', { class: 'tr-choose' });
  choose.append(el('h2', { class: 'tr-title', text: t('translateReadIn') }));
  choose.append(el('p', { class: 'tr-sub', text: t('translateOneStep') }));

  const tools = el('div', { class: 'tr-tools' });

  const filter = el('input', {
    type: 'search', class: 'tr-filter', id: 'trFilter', autocomplete: 'off',
    placeholder: t('translateFilter'), 'aria-label': t('translateFilter'),
  });
  tools.append(filter);

  // Which article is being translated. Explicit, because "the same article in
  // my language" has to mean the same English page, not whichever edition the
  // reader happened to open.
  const editionWrap = el('label', { class: 'tr-edition', for: 'trEdition' });
  editionWrap.append(el('span', { text: t('translateFrom') }));
  const edition = el('select', { id: 'trEdition', class: 'tr-select', 'aria-label': t('translateSource') });
  if (enTitle) {
    const option = el('option', { value: 'en' });
    option.textContent = t('translateSourceEnglish');
    edition.append(option);
  }
  if (!onEnglish) {
    const option = el('option', { value: 'current' });
    option.textContent = t('translateSourceCurrent', { lang: langRecord(state?.lang).name });
    edition.append(option);
  }
  if (!edition.options.length) {
    const option = el('option', { value: 'current' });
    option.textContent = t('translateSourceCurrent', { lang: langRecord(state?.lang).name });
    edition.append(option);
  }
  edition.value = enTitle ? 'en' : 'current';
  editionWrap.append(edition);
  tools.append(editionWrap);
  choose.append(tools);

  // The languages, India first, each as its own button in its own script.
  const grid = el('div', { class: 'tr-langs', role: 'group', 'aria-label': t('translatePick') });
  const groups = [
    { label: t('translateIndia'), items: WORLD_LANGS.slice(0, 31) },
    { label: t('translateWorld'), items: WORLD_LANGS.slice(31) },
  ];
  const buttons = [];
  const preferred = String(state?.lang || 'en').toLowerCase().startsWith('en') ? 'hi' : 'en';
  for (const group of groups) {
    const head = el('p', { class: 'tr-group', text: group.label });
    const row = el('div', { class: 'tr-group-grid' });
    for (const lang of group.items) {
      const btn = el('button', {
        type: 'button',
        class: `tr-lang${lang.code === preferred ? ' is-suggested' : ''}`,
        dataset: { code: lang.code, search: `${lang.code} ${lang.name} ${lang.native}`.toLowerCase() },
        'aria-label': `${lang.native} — ${lang.name}`,
      });
      btn.append(el('b', { text: lang.native }));
      btn.append(el('span', { text: lang.name }));
      if (lang.tier === 'experimental') btn.append(el('em', { class: 'tr-tier', text: t('tierExperimental') }));
      btn.addEventListener('click', () => runTranslation(lang.code));
      row.append(btn);
      buttons.push(btn);
    }
    grid.append(head, row);
  }
  choose.append(grid);

  const noMatch = el('p', { class: 'tr-empty', hidden: true, text: t('translateNoMatch') });
  choose.append(noMatch);

  // Said before anything is sent, not buried in a policy page.
  choose.append(el('p', { class: 'tr-disclosure', text: t('translateDisclosure') }));

  /* ── 2. the article, once a language is chosen ─────────────────────────── */
  const read = el('div', { class: 'tr-read', hidden: true });
  const bar = el('div', { class: 'tr-readbar' });
  const current = el('p', { class: 'tr-current', role: 'status', 'aria-live': 'polite' });
  const change = el('button', { type: 'button', class: 'btn btn-ghost', text: t('translateChange') });
  const stop = el('button', { type: 'button', class: 'btn btn-ghost', text: t('stopReading'), hidden: true });
  const again = el('button', { type: 'button', class: 'btn btn-primary', text: t('translateAgain'), hidden: true });
  bar.append(current, el('span', { class: 'tr-grow' }), again, stop, change);
  read.append(bar);

  const status = el('p', { class: 'tr-status', role: 'status', 'aria-live': 'polite' });
  read.append(status);

  const track = el('div', { class: 'tr-track', 'aria-hidden': 'true' }, [el('span')]);
  track.hidden = true;
  read.append(track);

  const body = el('div', { class: 'tr-body' });
  read.append(body);

  panel.append(choose, read);

  let controller = null;
  let lastCode = '';

  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const btn of buttons) {
      const hit = !q || btn.dataset.search.includes(q);
      btn.hidden = !hit;
      if (hit) shown += 1;
    }
    // Group headings with nothing under them go away too, so the list does
    // not read as a set of empty shelves.
    grid.querySelectorAll('.tr-group-grid').forEach((row) => {
      const any = [...row.children].some((b) => !b.hidden);
      row.hidden = !any;
      const head = row.previousElementSibling;
      if (head?.classList.contains('tr-group')) head.hidden = !any;
    });
    noMatch.hidden = shown > 0;
  });

  /** The DOM to translate: the English original, or the edition on screen. */
  async function sourceRoot() {
    if (edition.value === 'en' && enTitle) {
      const article = await ctx.api.article('en', enTitle);
      return { root: clean(article.html), lang: 'en', title: article.title || enTitle, revid: article.revid };
    }
    const live = state?.fullMount?.querySelector('.panel-wide');
    if (!live) throw new Error('no article');
    const clone = live.cloneNode(true);
    // Interactive chrome has no business inside a reading copy.
    clone.querySelectorAll('button, .md-disclosure, .fb-row, .toc-jump, [role="status"]').forEach((n) => n.remove());
    return { root: clone, lang: state.lang, title: state?.data?.title, revid: state?.data?.revid };
  }

  function showChooser() {
    controller?.abort();
    controller = null;
    panel.dataset.state = 'choosing';
    choose.hidden = false;
    read.hidden = true;
    track.hidden = true;
    body.replaceChildren();
    filter.focus();
  }

  /**
   * Choose a language, get the article.
   *
   * One press. The old panel asked for a language in a dropdown and then for
   * a second press on a button — a two-step that made the tab look like a
   * form rather than a reading choice.
   */
  async function runTranslation(code) {
    const record = langRecord(code);
    lastCode = code;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    panel.dataset.state = 'reading';
    choose.hidden = true;
    read.hidden = false;
    body.replaceChildren();
    current.textContent = `${record.native} · ${record.name}`;
    status.textContent = `${t('translateWorking')} — ${record.native}`;
    track.hidden = false;
    track.querySelector('span').style.width = '4%';
    stop.hidden = false;
    again.hidden = true;

    try {
      const origin = await sourceRoot();
      const result = await translateFragment(origin.root, code, {
        source: origin.lang || 'auto',
        signal,
        onProgress: (done, total) => {
          const pct = total ? Math.round((done / total) * 100) : 100;
          track.querySelector('span').style.width = `${Math.max(4, pct)}%`;
          status.textContent = `${t('translateWorking')} ${done}/${total}`;
        },
      });
      if (signal.aborted) return;

      // Language and direction belong on the translated block, so assistive
      // technology reads it in the right voice and the right way round.
      const out = el('div', { class: 'translated-article' });
      out.lang = code;
      out.dir = isRtlLang(code) ? 'rtl' : 'ltr';
      const note = el('div', { class: 'tr-note' });
      note.append(el('p', {
        html: `${esc(t('translateNote', { lang: record.native }))} <span class="tr-partial">${esc(t('machineTranslated'))}</span>`,
      }));
      note.append(el('p', { class: 'tr-hint', text: t('translateOriginalNote') }));
      if (result.failed) {
        note.append(el('p', { class: 'tr-partial', text: t('translatePartial', { count: String(result.failed) }) }));
      }
      out.append(note);
      out.append(origin.root);
      body.append(out);
      track.querySelector('span').style.width = '100%';
      status.textContent = result.failed
        ? t('translatePartial', { count: String(result.failed) })
        : t('translateDone');
    } catch (err) {
      if (err?.name === 'AbortError') {
        status.textContent = t('translateCancelled');
      } else {
        status.textContent = t('translateFailed');
        // Offer the one thing that helps after a failure.
        again.hidden = false;
      }
    } finally {
      if (controller?.signal === signal) {
        controller = null;
        stop.hidden = true;
        track.hidden = true;
      }
    }
  }

  change.addEventListener('click', showChooser);
  again.addEventListener('click', () => runTranslation(lastCode));
  stop.addEventListener('click', () => {
    controller?.abort();
    controller = null;
    stop.hidden = true;
    track.hidden = true;
  });

  // The view calls this when the reader leaves the page or switches tabs.
  panel.abortTranslation = () => controller?.abort();

  return panel;
}
