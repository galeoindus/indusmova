/* indusmova — the answer architecture, shared by every view that shows one.
 *
 * These are the pieces that make an indusmova answer look like an indusmova
 * answer rather than a Wikipedia page: the evidence strip that says how the
 * answer was ranked, the numbered topic blocks that open short and extend on
 * demand, the transparency note, the source cards, the facts box and the
 * emoji feedback row.
 *
 * Ask and Article both build from here, so the two read as one product.
 */

import { el, clamp } from './ui.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { articleHref } from './router.js';
import { toast } from './components.js';
import { download } from './markdown.js';

/** How the answer was assembled: what was read, how it was ranked. */
export function evidenceStrip({ matched = 0, considered = 0, sections = 0, title = '', rankedBy = 'relevance', deep = false }) {
  const ok = matched > 0;
  const strip = el('div', { class: `evidence ${ok ? 'is-ok' : 'is-warn'}` });
  const head = el('p', { class: 'evidence-head' });
  head.append(el('span', {
    class: 'evidence-label',
    text: deep ? t('rankedByMeaning') : t('rankedByRelevance'),
  }));
  head.append(el('span', {
    class: 'evidence-note',
    text: ok
      ? t('evidenceCount', { matched, considered, sections, title })
      : t('evidenceNone', { title }),
  }));
  strip.append(head);
  strip.append(el('p', {
    class: 'evidence-explainer',
    text: t('evidenceExplainer'),
  }));
  return strip;
}

/**
 * Numbered topic blocks. Each opens with two sentences and a control that
 * reveals the rest of the section — short by default, extended on demand.
 * At "deep dive" depth they open extended straight away.
 */
export function topicBlocks(topics, { open = false, onGoto = null, idPrefix = 'topic' } = {}) {
  const frag = document.createDocumentFragment();
  for (const topic of topics) {
    const block = el('div', { class: `topic-block${open ? ' is-open' : ''}`, id: `${idPrefix}-${topic.id}` });

    const head = el('h3');
    head.append(el('span', { class: 'topic-num', text: String(topic.number ?? '') }));
    head.append(el('span', { text: topic.title }));
    if (onGoto) {
      const goto = el('button', { type: 'button', class: 'topic-goto', text: `· ${t('readFullSection')}` });
      goto.addEventListener('click', () => onGoto(topic));
      head.append(goto);
    }
    block.append(head);

    // A picture from this section, when the article has one.
    const picture = (topic.images || [])[0];
    if (picture) {
      const figure = el('figure', { class: 'topic-figure' });
      figure.append(el('img', { src: picture.src, alt: picture.alt || '', loading: 'lazy', decoding: 'async' }));
      if (picture.caption) figure.append(el('figcaption', { text: picture.caption }));
      block.append(figure);
    }

    const short = el('div', { class: 'topic-short' });
    (topic.short || topic.points).forEach((line) => short.append(el('p', { text: line })));
    block.append(short);

    const rest = (topic.full || []).slice((topic.short || []).length);
    if (rest.length) {
      const full = el('div', { class: 'topic-full', hidden: !open });
      rest.forEach((line) => full.append(el('p', { text: line })));
      block.append(full);

      const more = el('button', {
        type: 'button', class: 'topic-more', 'aria-expanded': String(open),
        text: open ? t('showLess') : `${t('showMore')} (${rest.length})`,
      });
      more.addEventListener('click', () => {
        const nowOpen = block.classList.toggle('is-open');
        full.hidden = !nowOpen;
        more.setAttribute('aria-expanded', String(nowOpen));
        more.textContent = nowOpen ? t('showLess') : `${t('showMore')} (${rest.length})`;
      });
      block.append(more);
    }
    frag.append(block);
  }
  return frag;
}

/** The transparency note: exactly how this answer was produced. */
export function methodNote(method = {}, { revid = '', lang = 'en', title = '', wikiUrl = '' } = {}) {
  const details = el('details', { class: 'method-note' });
  const summary = el('summary');
  summary.append(el('span', { text: t('howThisWasMade') }));
  // The headline fact stays visible even when the panel is closed.
  summary.append(el('span', {
    class: 'method-summary',
    text: `${method.sentencesMatched ?? 0} ${t('ofWord')} ${method.sentencesConsidered ?? 0} · ${method.sectionsRead ?? 0} ${t('sectionsWord')}`,
  }));
  details.append(summary);
  const ul = el('ul', { class: 'line-list' });
  const rows = [
    `${t('depthLabel')}: ${t(method.depth === 'quick' ? 'quickAnswer' : method.depth === 'deep' ? 'deepDive' : 'detailed')}`,
    `${t('rankedBy')}: ${method.rankedBy === 'meaning' ? t('meaningModel') : t('keywordOverlap')}`,
    `${t('sentencesConsidered')}: ${method.sentencesConsidered ?? 0} — ${method.sentencesMatched ?? 0} ${t('matchedTheQuestion')}`,
    `${t('sectionsRead')}: ${method.sectionsRead ?? 0} — ${t('topicsShown')}: ${method.topicsShown ?? 0}`,
  ];
  rows.forEach((r) => ul.append(el('li', { text: r })));
  details.append(ul);
  const p = el('p');
  p.append(document.createTextNode(`${t('sourceLabel')}: `));
  p.append(el('a', { href: wikiUrl, target: '_blank', rel: 'noopener noreferrer', text: `${lang}.wikipedia.org › ${title}` }));
  if (revid) p.append(document.createTextNode(` · ${t('revision')} ${revid}`));
  details.append(p);
  details.append(el('p', { text: t('attribution') }));
  return details;
}

/** The infobox, as a factbox. */
export function factsBox(facts, title = '') {
  if (!facts || !facts.length) return null;
  const box = el('div', { class: 'factbox' });
  box.append(el('h3', { html: `${esc(t('facts'))}<span class="factbox-src">${esc(title)}</span>` }));
  const dl = el('dl');
  for (const fact of facts) {
    const row = el('div', { class: 'row' });
    row.append(el('dt', { text: fact.label }));
    row.append(el('dd', { text: fact.value }));
    dl.append(row);
  }
  box.append(dl);
  box.append(el('p', { class: 'src-credit', text: t('factsNote') }));
  return box;
}

/** Sources, as cards with the licence and a link. */
export function sourcesGroup({ lang = 'en', title = '', wikiUrl = '', citations = [], project = 'wikipedia', revision = null } = {}) {
  const group = el('div', { class: 'src-group' });

  // The audit's point (F-14): a source we actually read is not the same thing
  // as a source we merely link to. They are listed separately, and the second
  // list says plainly that it was not used to choose the sentences.
  group.append(el('h3', { text: t('evidenceUsed') }));
  const used = el('div', { class: 'source-answer' });
  const box = el('div', { class: 'source-card' });
  const head = el('div', { class: 'sc-title' });
  head.append(el('a', { href: wikiUrl, target: '_blank', rel: 'noopener noreferrer', text: title || `${lang}.${project}.org` }));
  head.append(el('span', { class: 'sc-kind', text: t('encyclopaedia') }));
  box.append(head);
  const meta = el('dl', { class: 'sc-meta' });
  const row = (label, value) => {
    const r = el('div', { class: 'row' });
    r.append(el('dt', { text: label }));
    r.append(el('dd', { text: value }));
    meta.append(r);
  };
  row(t('licence'), 'CC BY-SA 4.0');
  row(t('fromSource'), `${lang}.${project}.org`);
  if (revision?.revid) row(t('revisionId'), String(revision.revid));
  box.append(meta);
  if (revision?.url) {
    const link = el('p', { class: 'src-credit' });
    link.append(el('a', { href: revision.url, target: '_blank', rel: 'noopener noreferrer', text: t('viewSourceRevision') }));
    box.append(link);
  }
  used.append(box);
  group.append(used);

  if (citations.length) {
    const details = el('details', { class: 'src-records' });
    details.append(el('summary', { text: `${t('citations')} (${citations.length})` }));
    const ol = el('ol', { class: 'line-list' });
    citations.slice(0, 12).forEach((c) => ol.append(el('li', { text: clamp(c, 220) })));
    details.append(ol);
    group.append(details);
  }

  group.append(el('h3', { text: t('furtherReading') }));
  const further = el('ul', { class: 'line-list' });
  further.append(el('li', { html: `<a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">Wikidata</a> — ${esc(t('structuredData'))}, CC0 1.0` }));
  further.append(el('li', { html: `<a href="https://commons.wikimedia.org/" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> — ${esc(t('media'))}, ${esc(t('perFile'))}` }));
  group.append(further);
  group.append(el('p', { class: 'src-credit', text: t('notConsulted') }));

  group.append(el('p', { class: 'src-credit', text: t('attribution') }));
  // Say plainly that the text was changed, and where the untouched original lives.
  const notice = el('p', { class: 'src-credit modification-notice' });
  notice.append(document.createTextNode(`${t('modificationNotice')} `));
  notice.append(el('a', { href: wikiUrl, target: '_blank', rel: 'noopener noreferrer', text: `${lang}.${project}.org` }));
  notice.append(document.createTextNode('.'));
  group.append(notice);
  return group;
}

/**
 * The reference list, numbered, with ids the inline markers point at.
 * Wikipedia's own list is reused — nothing is invented.
 */
export function referencesBlock(references = []) {
  if (!references.length) return null;
  const section = el('section', { class: 'sec', id: 'references' });
  section.append(el('div', { class: 'sec-head', html: `<h2>${esc(t('references'))}</h2><span class="more">${references.length}</span>` }));
  const ol = el('ol', { class: 'reference-list' });
  references.forEach((text, i) => {
    const li = el('li', { id: `ref-${i + 1}`, text: clamp(text, 400) });
    ol.append(li);
  });
  section.append(ol);
  return section;
}

/**
 * The actions that belong beside the answer rather than above it.
 *
 * Save, share, open at the source and export all live here, folded away until
 * asked for, so the top of the page stays a heading and a question rather than
 * a row of boxes of four different heights.
 */
export function railActions(items) {
  const details = el('details', { class: 'rail-actions' });
  const summary = el('summary');
  summary.append(el('span', { class: 'rail-actions-icon', html: icon('share') }));
  summary.append(el('span', { text: t('actions') }));
  details.append(summary);
  const body = el('div', { class: 'rail-actions-body' });
  // Accept either a list of controls or a single container holding them.
  const list = Array.isArray(items) ? items : [items];
  for (const item of list) if (item) body.append(item);
  details.append(body);
  return details;
}

/**
 * Copy and download, kept behind one control.
 *
 * The reader asked for these not to sit in the open: they are a convenience,
 * not the main path, so a single labelled button reveals them on request.
 */
export function markdownActions({ getText, filename }) {
  const wrap = el('div', { class: 'md-disclosure' });
  const panelId = 'mdActions';
  const toggle = el('button', {
    type: 'button', class: 'btn btn-ghost', 'aria-expanded': 'false', 'aria-controls': panelId,
    html: `${icon('copy')}<span>${esc(t('markdownActions'))}</span>`,
  });
  const panel = el('div', { class: 'md-disclosure-panel', id: panelId, hidden: true });

  const copy = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', html: `${icon('copy')}<span>${esc(t('copyMarkdown'))}</span>` });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getText()); toast(t('copied')); }
    catch { toast(t('copyFailed')); }
  });
  const dl = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', html: `${icon('download')}<span>${esc(t('downloadMarkdown'))}</span>` });
  dl.addEventListener('click', () => download(`${String(filename).replace(/[^\w\s-]/g, '')}.md`, getText()));
  panel.append(copy, dl);

  toggle.addEventListener('click', () => {
    const open = panel.hasAttribute('hidden');
    if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', String(open));
  });

  wrap.append(toggle, panel);
  return wrap;
}

/**
 * The one-line trust statement, kept near the answer rather than in the footer:
 * these passages were selected from a named article, not written.
 */
export function selectedNote(articleTitle, lang, wikiUrl) {
  const note = el('p', { class: 'selected-note' });
  note.append(document.createTextNode(`${t('selectedNotGenerated')} `));
  if (wikiUrl) note.append(el('a', { href: wikiUrl, target: '_blank', rel: 'noopener noreferrer', text: articleTitle }));
  return note;
}

/** A short note on what the answer does and does not cover. */
export function scopeNote(text) {
  const box = el('div', { class: 'scope-note' });
  box.append(el('p', { text }));
  return box;
}

const FEEDBACK = [
  { id: 'helpful', emoji: '👍', label: 'helpful', note: 'What was useful?' },
  { id: 'unclear', emoji: '🤔', label: 'unclear', note: 'What was confusing?' },
  { id: 'wrong', emoji: '🐞', label: 'wrong', note: 'What looks wrong?' },
  { id: 'idea', emoji: '💡', label: 'idea', note: 'What would you add?' },
];

/** The emoji feedback row. Nothing leaves the device until you press send. */
export function feedback(ctx, key) {
  const wrap = el('div', { class: 'feedback' });
  wrap.append(el('div', { class: 'panel-head', text: t('feedback') }));
  const row = el('div', { class: 'fb-row', role: 'group', 'aria-label': t('feedback') });

  const note = el('div', { class: 'fb-note', hidden: true });
  const label = el('label', { text: '' });
  const area = el('textarea', { rows: '3', placeholder: t('feedbackPlaceholder') });
  const actions = el('div', { class: 'fb-actions' });
  const send = el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: t('send') });
  const cancel = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: t('cancel') });
  actions.append(send, cancel);
  note.append(label, area, actions);
  const thanks = el('p', { class: 'fb-thanks', role: 'status', 'aria-live': 'polite' });

  let chosen = null;
  for (const item of FEEDBACK) {
    const btn = el('button', {
      type: 'button', class: 'fb-btn', 'aria-pressed': 'false',
      html: `<span class="fb-emoji" aria-hidden="true">${item.emoji}</span><span>${esc(t(`fb_${item.label}`))}</span>`,
    });
    btn.addEventListener('click', () => {
      chosen = item;
      row.querySelectorAll('.fb-btn').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      label.textContent = item.note;
      note.hidden = false;
      area.focus();
    });
    row.append(btn);
  }
  cancel.addEventListener('click', () => { note.hidden = true; });
  send.addEventListener('click', () => {
    const body = encodeURIComponent(`${area.value}\n\n— ${chosen?.label || 'feedback'} on ${key} · indusmova`);
    window.location.href = `mailto:bholasee8816@gmail.com?subject=${encodeURIComponent(`[indusmova] ${chosen?.label || 'feedback'}`)}&body=${body}`;
    note.hidden = true;
    thanks.textContent = t('feedbackThanks');
  });

  wrap.append(row, note, thanks);
  return wrap;
}

/** A curated footnote, for answers that lean on one section. */
export function curatedNote(text) {
  return el('p', { class: 'curated', text });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { articleHref };
