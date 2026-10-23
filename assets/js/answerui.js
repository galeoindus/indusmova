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
export function topicBlocks(topics, { open = false, onGoto = null } = {}) {
  const frag = document.createDocumentFragment();
  for (const topic of topics) {
    const block = el('div', { class: `topic-block${open ? ' is-open' : ''}`, id: `topic-${topic.id}` });

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
  details.append(el('summary', { text: t('howThisWasMade') }));
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
  return box;
}

/** Sources, as cards with the licence and a link. */
export function sourcesGroup({ lang = 'en', title = '', wikiUrl = '', citations = [] } = {}) {
  const group = el('div', { class: 'src-group' });
  group.append(el('h3', { text: t('sourcesHeading') }));

  const wrap = el('div', { class: 'source-answer' });
  const cards = [
    { name: 'Wikipedia', kind: t('encyclopaedia'), url: wikiUrl, note: `${lang}.wikipedia.org`, licence: 'CC BY-SA 4.0' },
    { name: 'Wikidata', kind: t('structuredData'), url: 'https://www.wikidata.org/', note: 'wikidata.org', licence: 'CC0 1.0' },
    { name: 'Wikimedia Commons', kind: t('media'), url: 'https://commons.wikimedia.org/', note: 'commons.wikimedia.org', licence: t('perFile') },
  ];
  for (const card of cards) {
    const box = el('div', { class: 'source-card' });
    const head = el('div', { class: 'sc-title' });
    head.append(el('a', { href: card.url, target: '_blank', rel: 'noopener noreferrer', text: card.name }));
    head.append(el('span', { class: 'sc-kind', text: card.kind }));
    box.append(head);
    const meta = el('dl', { class: 'sc-meta' });
    const row = (label, value) => {
      const r = el('div', { class: 'row' });
      r.append(el('dt', { text: label }));
      r.append(el('dd', { text: value }));
      meta.append(r);
    };
    row(t('licence'), card.licence);
    row(t('fromSource'), card.note);
    box.append(meta);
    wrap.append(box);
  }
  group.append(wrap);

  if (citations.length) {
    const details = el('details', { class: 'src-records' });
    details.append(el('summary', { text: `${t('citations')} (${citations.length})` }));
    const ol = el('ol', { class: 'line-list' });
    citations.slice(0, 12).forEach((c) => ol.append(el('li', { text: clamp(c, 220) })));
    details.append(ol);
    group.append(details);
  }
  group.append(el('p', { class: 'src-credit', text: t('attribution') }));
  return group;
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
