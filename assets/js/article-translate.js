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
  const panel = el('div', { class: 'tr-panel' });

  const bar = el('div', { class: 'tr-bar' });
  const label = el('label', { class: 'tr-pick', for: 'trLang' });
  label.append(el('span', { text: t('translatePick') }));

  const select = el('select', { id: 'trLang', class: 'tr-select', 'aria-label': t('translatePick') });
  // Grouped so a reader can find their own language without scrolling a
  // hundred entries: India first, then the world. A language whose provider
  // support has not been reviewed says so, rather than looking identical to
  // one that has.
  const groups = [
    { label: t('translateIndia'), items: WORLD_LANGS.slice(0, 31) },
    { label: t('translateWorld'), items: WORLD_LANGS.slice(31) },
  ];
  for (const group of groups) {
    const optgroup = el('optgroup', { label: group.label });
    for (const lang of group.items) {
      const option = el('option', { value: lang.code });
      option.textContent = lang.tier === 'experimental'
        ? `${lang.native} — ${lang.name} · ${t('tierExperimental')}`
        : `${lang.native} — ${lang.name}`;
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

  // Which article is being translated. Explicit, because "the same article in
  // my language" has to mean the same English page, not whichever edition the
  // reader happened to open.
  const enTitle = englishTitle(state);
  const onEnglish = String(state?.lang || '').toLowerCase().startsWith('en');
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
  bar.append(edition);

  const run = el('button', { type: 'button', class: 'btn btn-primary', text: t('translateStart') });
  const stop = el('button', { type: 'button', class: 'btn btn-ghost', text: t('stopReading'), hidden: true });
  bar.append(run, stop);
  panel.append(bar);

  // Said before anything is sent, not buried in a policy page.
  const disclosure = el('p', { class: 'tr-disclosure' });
  disclosure.textContent = t('translateDisclosure');
  panel.append(disclosure);

  const status = el('p', { class: 'tr-status', role: 'status', 'aria-live': 'polite' });
  status.textContent = t('translateEmpty');
  panel.append(status);

  const track = el('div', { class: 'tr-track', 'aria-hidden': 'true' }, [el('span')]);
  track.hidden = true;
  panel.append(track);

  const body = el('div', { class: 'tr-body' });
  panel.append(body);

  // The translated region announces its own language and direction as soon as
  // a language is chosen, so assistive technology switches voice before the
  // text arrives rather than reading Hindi in an English voice.
  const markRegion = (target) => {
    body.lang = target;
    body.dir = isRtlLang(target) ? 'rtl' : 'ltr';
  };
  select.addEventListener('change', () => markRegion(select.value));
  markRegion(select.value);

  let controller = null;

  const setBusy = (busy) => {
    run.disabled = busy;
    select.disabled = busy;
    edition.disabled = busy;
    stop.hidden = !busy;
    track.hidden = !busy;
    run.textContent = busy ? t('translateWorking') : t('translateStart');
  };

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

  run.addEventListener('click', async () => {
    const target = select.value;
    const record = langRecord(target);
    controller = new AbortController();
    setBusy(true);
    body.replaceChildren();
    status.textContent = `${t('translateWorking')} — ${record.native}`;
    track.querySelector('span').style.width = '4%';

    try {
      const origin = await sourceRoot();
      const result = await translateFragment(origin.root, target, {
        source: origin.lang || 'auto',
        signal: controller.signal,
        onProgress: (done, total) => {
          const pct = total ? Math.round((done / total) * 100) : 100;
          track.querySelector('span').style.width = `${Math.max(4, pct)}%`;
          status.textContent = `${t('translateWorking')} ${done}/${total}`;
        },
      });

      // Language and direction belong on the translated block, so assistive
      // technology reads it in the right voice and the right way round.
      const out = el('div', { class: 'translated-article' });
      out.lang = target;
      out.dir = isRtlLang(target) ? 'rtl' : 'ltr';
      const note = el('div', { class: 'tr-note' });
      note.append(el('p', {
        html: `${esc(t('translateNote', { lang: record.native }))} <span class="tr-partial">${esc(t('machineTranslated'))}</span>`,
      }));
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
      if (err?.name === 'AbortError') status.textContent = t('translateCancelled');
      else status.textContent = t('translateFailed');
    } finally {
      setBusy(false);
    }
  });

  stop.addEventListener('click', () => controller?.abort());

  // The view calls this when the reader leaves the page or switches tabs.
  panel.abortTranslation = () => controller?.abort();

  return panel;
}
