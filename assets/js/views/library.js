/* indusmova — the Library.
 *
 * One search box across every free, keyless source indusmova knows: the
 * Wikimedia family, Project Gutenberg, Open Library, the Internet Archive,
 * Crossref, OpenAlex, Europe PMC, PubMed and DOAJ.
 *
 * Two views live here:
 *
 *   #/library?q=…&src=…   results, grouped by source, each card named
 *   #/work?src=…&id=…     one book, paper or archive item, rendered in the
 *                         same architecture as an article: what it is, its
 *                         abstract or description as readable sentences, its
 *                         metadata as facts, and the source it came from
 */

import { el, clamp, cleanUrl } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { sentences } from '../parse.js';
import { evidenceStrip, methodNote, factsBox, sourcesGroup, scopeNote, feedback, curatedNote } from '../answerui.js';
import { sectionHead, card, errorBox, emptyState, toast, srcRow } from '../components.js';
import { composerForm, attachSuggest } from '../composer.js';
import { SOURCE_LIST, searchAll, getRecord, SOURCE_BY_ID } from '../sources.js';
import { articleHref, searchHref, workHref } from '../router.js';

const FAMILIES = [
  { id: 'all', label: 'All sources' },
  { id: 'wikimedia', label: 'Wikimedia' },
  { id: 'books', label: 'Books' },
  { id: 'research', label: 'Research' },
  { id: 'archive', label: 'Archive' },
];

/* ---------------------------------------------------------------- library */

export async function renderLibrary(ctx, route) {
  const wrap = el('div', { class: 'wrap' });
  const query = (route.query.q || '').trim();
  const only = route.query.src || '';

  const head = el('div', { class: 'article-head' });
  head.append(el('span', { class: 'kicker', text: `${SOURCE_LIST.length} open sources · no API keys` }));
  head.append(el('h1', { class: 'article-title', text: query ? `“${query}”` : t('library') }));
  head.append(el('p', { class: 'article-sub', text: t('libraryBlurb') }));
  wrap.append(head);

  const composer = el('div', { class: 'composer', style: 'margin:0 0 18px;max-width:none' });
  const form = composerForm(ctx, { placeholderKey: 'libraryPlaceholder', autofocus: !query, initialMode: 'search' });
  composer.append(form);
  composer.append(el('p', { class: 'voice-status', id: 'voiceStatus', role: 'status', 'aria-live': 'polite' }));
  attachSuggest(form.querySelector('textarea'), ctx);
  if (query) form.querySelector('textarea').value = query;
  wrap.append(composer);

  wrap.append(familyChips(ctx, query, only));

  if (!query) {
    wrap.append(catalogue());
    return wrap;
  }

  const mount = el('div');
  wrap.append(mount);
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${esc(t('searchingSources'))}</p>` }));
  runLibrary(ctx, mount, query, only);
  return wrap;
}

function familyChips(ctx, query, only) {
  const wrap = el('div', { class: 'chips', style: 'justify-content:flex-start;margin:0 0 18px' });
  for (const fam of FAMILIES) {
    const active = (!only && fam.id === 'all') || only === fam.id;
    const chip = el('a', {
      class: `chip${active ? ' is-active' : ''}`,
      href: fam.id === 'all' ? `#/library?q=${encodeURIComponent(query)}` : `#/library?q=${encodeURIComponent(query)}&src=${fam.id}`,
      text: fam.label,
    });
    wrap.append(chip);
  }
  return wrap;
}

async function runLibrary(ctx, mount, query, only) {
  const family = only && only !== 'all' ? only : null;
  const ids = family
    ? SOURCE_LIST.filter((s) => s.family === family).map((s) => s.id)
    : null;
  try {
    const groups = await searchAll(query, { limit: 6, lang: ctx.state.contentLang, only: ids });
    mount.innerHTML = '';

    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const failed = groups.filter((g) => !g.ok);

    const summary = el('p', { class: 'ask-note', style: 'margin-bottom:18px' });
    summary.textContent = `${total} ${t('resultsAcross')} ${groups.filter((g) => g.ok).length} ${t('sourcesWord')}`
      + (failed.length ? ` · ${failed.length} ${t('unreachable')}: ${failed.map((f) => f.name).join(', ')}` : '');
    mount.append(summary);

    if (!total) {
      mount.append(emptyState({
        iconName: 'search', title: t('noResults'), body: t('libraryBlurb'),
        cta: t('askMode'), ctaHref: searchHref(query, { mode: 'ask' }),
      }));
      return;
    }

    for (const group of groups) {
      if (!group.ok || !group.items.length) continue;
      const section = el('section', { class: 'sec' });
      const head = el('div', { class: 'dash-band-head' });
      const left = el('div');
      left.append(el('h2', { html: `<span class="ic">${icon('sources')}</span>${esc(group.name)} <span class="badge">${esc(group.kind)}</span>` }));
      left.append(el('p', { text: `${group.items.length} ${t('resultsWord')} · ${group.licence || ''}` }));
      head.append(left);
      head.append(el('a', { class: 'rail-more', href: `#/library?q=${encodeURIComponent(query)}&src=${group.source}`, html: `${esc(t('viewAll'))} →` }));
      section.append(head);

      const grid = el('div', { class: 'grid' });
      for (const item of group.items) grid.append(itemCard(item, ctx));
      section.append(grid);
      mount.append(section);
    }
  } catch (err) {
    mount.innerHTML = '';
    mount.append(errorBox(err?.message, { onRetry: () => runLibrary(ctx, mount, query, only) }));
  }
}

/** A card for any source's item, always naming where it came from. */
function itemCard(item, ctx) {
  const href = item.inApp
    ? articleHref(item.inApp.title, ctx.state.contentLang, item.inApp.project)
    : workHref(item.source, item.id);
  const node = el('a', { class: 'card', href });
  const thumb = el('div', { class: 'card-thumb' });
  if (item.thumb) thumb.append(el('img', { src: cleanUrl(item.thumb), alt: '', loading: 'lazy', decoding: 'async' }));
  else { thumb.classList.add('placeholder'); thumb.setAttribute('aria-hidden', 'true'); thumb.innerHTML = PLACEHOLDER; }
  node.append(thumb);

  const body = el('div', { class: 'card-body' });
  body.append(el('h3', { text: item.title }));
  if (item.extract) body.append(el('p', { text: clamp(item.extract, 150) }));
  const meta = el('div', { class: 'card-meta' });
  meta.append(el('span', { class: 'badge accent', text: item.sourceName }));
  const extra = (item.meta || []).find((m) => /author|year|creator|published/i.test(m.label));
  if (extra) meta.append(el('span', { class: 'card-meta-extra', text: `${extra.label}: ${extra.value}` }));
  body.append(meta);
  node.append(body);
  return node;
}

/** The catalogue shown before anything is typed. */
function catalogue() {
  const wrap = el('div');
  const groups = [
    { title: 'Wikimedia', family: 'wikimedia' },
    { title: 'Books', family: 'books' },
    { title: 'Research', family: 'research' },
    { title: 'Archive', family: 'archive' },
  ];
  for (const g of groups) {
    const list = SOURCE_LIST.filter((s) => s.family === g.family);
    if (!list.length) continue;
    const section = el('section', { class: 'sec' });
    section.append(sectionHead({ title: g.title }));
    const grid = el('div', { class: 'src-grid' });
    for (const source of list) {
      const box = el('div', { class: 'src-group' });
      box.append(el('h3', { html: `<a href="${source.home}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a>` }));
      const ul = el('ul', { class: 'line-list' });
      ul.append(el('li', { html: `<strong>${esc(t('whatItIs'))}:</strong> ${esc(source.kind)}` }));
      ul.append(el('li', { html: `<strong>${esc(t('licence'))}:</strong> ${esc(source.licence || '—')}` }));
      ul.append(el('li', { html: `<strong>${esc(t('fromSource'))}:</strong> ${esc(new URL(source.home).host)}` }));
      box.append(ul);
      const credit = el('p', { class: 'src-credit' });
      credit.append(el('a', { class: 'btn btn-ghost btn-sm', href: `#/library?q=${encodeURIComponent(source.name)}&src=${source.id}`, text: `${t('searchSource')} →` }));
      box.append(credit);
      grid.append(box);
    }
    section.append(grid);
    wrap.append(section);
  }
  return wrap;
}

/**
 * "More from open sources" — the same topic, from the other free sources.
 * Used under an article and under an answer. Sources that fail are skipped.
 */
export async function mountOpenSources(ctx, mount, query) {
  if (!query) return;
  const skip = ['wikipedia', 'wiktionary'];
  try {
    const groups = await searchAll(query, { limit: 3, lang: ctx.state.contentLang, skip });
    const items = groups.filter((g) => g.ok).flatMap((g) => g.items).slice(0, 9);
    if (!items.length) return;
    const section = el('section', { class: 'sec' });
    const head = el('div', { class: 'dash-band-head' });
    const left = el('div');
    left.append(el('h2', { html: `<span class="ic">${icon('sources')}</span>${esc(t('moreFromSources'))}` }));
    left.append(el('p', { text: t('moreFromSourcesBlurb') }));
    head.append(left);
    head.append(el('a', { class: 'rail-more', href: `#/library?q=${encodeURIComponent(query)}`, html: `${esc(t('viewAll'))} →` }));
    section.append(head);
    const grid = el('div', { class: 'grid' });
    for (const item of items) grid.append(itemCard(item, ctx));
    section.append(grid);
    mount.append(section);
  } catch { /* the band is a bonus */ }
}

/* ------------------------------------------------------------------- work */

export async function renderWork(ctx, route) {
  const wrap = el('div', { class: 'wrap-narrow' });
  const sourceId = route.query.src || '';
  const id = route.query.id || '';
  const source = SOURCE_BY_ID[sourceId];

  if (!source || !id) {
    wrap.append(emptyState({
      iconName: 'search', title: t('notFound'), body: t('notFoundBody'),
      cta: t('library'), ctaHref: '#/library',
    }));
    return wrap;
  }

  const mount = el('div');
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${esc(t('loading'))}</p>` }));
  wrap.append(mount);
  buildWork(ctx, mount, source, id);
  return wrap;
}

async function buildWork(ctx, mount, source, id) {
  try {
    const record = await getRecord(source.id, id, { lang: ctx.state.contentLang });
    if (!record) {
      mount.innerHTML = '';
      mount.append(emptyState({
        iconName: 'info', title: t('recordUnavailable'),
        body: `${source.name} did not return this record. It may have moved, or the source may be unreachable right now.`,
        cta: t('library'), ctaHref: '#/library',
      }));
      return;
    }
    paintWork(ctx, mount, record);
  } catch (err) {
    mount.innerHTML = '';
    mount.append(errorBox(err?.message, { onRetry: () => buildWork(ctx, mount, source, id) }));
  }
}

function paintWork(ctx, mount, record) {
  mount.innerHTML = '';
  const key = `${record.source}:${record.id}`;

  const head = el('div', { class: 'article-head' });
  head.append(el('span', { class: 'kicker', text: `${record.sourceName} · ${record.kind}` }));
  head.append(el('h1', { class: 'article-title', text: record.title }));
  if (record.meta?.length) {
    head.append(el('p', { class: 'article-sub', text: record.meta.map((m) => `${m.label}: ${m.value}`).join(' · ') }));
  }
  mount.append(head);

  // Cover, when the source provides one.
  if (record.thumb) {
    const figure = el('figure', { class: 'art-figure', style: 'margin:0 0 22px;justify-items:start' });
    figure.append(el('img', { src: cleanUrl(record.thumb), alt: record.title, loading: 'lazy', decoding: 'async', style: 'max-height:320px;width:auto' }));
    mount.append(figure);
  }

  const actions = el('div', { class: 'article-actions' });
  actions.append(el('a', {
    class: 'btn btn-primary', href: record.url, target: '_blank', rel: 'noopener noreferrer',
    html: `${esc(t('openAt'))} ${esc(record.sourceName)} ↗`,
  }));
  const save = el('button', { type: 'button', class: `btn btn-ghost${ctx.isBookmarked(key) ? ' is-on' : ''}`, html: `${icon('bookmark')}<span>${esc(ctx.isBookmarked(key) ? t('saved') : t('bookmarks'))}</span>` });
  save.addEventListener('click', () => {
    const saved = ctx.toggleBookmark({ id: key, title: record.title, lang: ctx.state.contentLang, url: workHref(record.source, record.id), extract: clamp(record.extract, 160) });
    save.innerHTML = `${icon('bookmark')}<span>${esc(saved ? t('saved') : t('bookmarks'))}</span>`;
    save.classList.toggle('is-on', saved);
    toast(saved ? t('saved') : t('remove'));
  });
  actions.append(save);
  if (record.readUrl) {
    actions.append(el('a', { class: 'btn btn-ghost', href: record.readUrl, target: '_blank', rel: 'noopener noreferrer', text: t('readOnline') }));
  }
  mount.append(actions);

  mount.append(evidenceStrip({
    matched: 0, considered: 0, sections: 0, title: record.title, rankedBy: 'relevance',
  }));

  const lines = sentences(record.extract || '');
  if (lines.length) {
    const qa = el('div', { class: 'qa-answer' });
    qa.append(el('h2', { text: t('summary') }));
    const list = el('ul', { class: 'line-list' });
    lines.slice(0, 8).forEach((s) => list.append(el('li', { text: s })));
    qa.append(list);
    mount.append(qa);
  } else {
    mount.append(el('p', { class: 'ask-note', text: 'This source returns a catalogue record without a description. The full record is at the source.' }));
  }

  const facts = factsBox(record.meta || [], record.sourceName);
  if (facts) mount.append(facts);

  mount.append(sourcesGroup({
    lang: ctx.state.contentLang,
    title: record.title,
    wikiUrl: record.url,
    citations: [],
  }));
  mount.append(methodNote({ depth: 'detailed', rankedBy: 'relevance' }, { title: record.title, lang: record.sourceName, wikiUrl: record.url }));
  mount.append(scopeNote(`This record comes from ${record.sourceName}. indusmova shows the metadata and description that source publishes; the full work is on their site.`));
  mount.append(feedback(ctx, key));
}

const PLACEHOLDER = `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#173b32"/><rect x="6.6" y="6.6" width="26.8" height="26.8" rx="6.2" fill="none" stroke="#f5f0e6" stroke-opacity=".32" stroke-width="1.3"/><g fill="none" stroke="#f5f0e6" stroke-width="2.7" stroke-linecap="round"><path d="M10.2 16.5c2.85-3.5 5.7-3.5 8.55 0s5.7 3.5 8.55 0"/><path d="M12.4 23.5c2.85-3.5 5.7-3.5 8.55 0s5.7 3.5 8.55 0"/></g></svg>`;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
