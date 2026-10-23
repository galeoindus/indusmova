/* indusmova — the article view.
 *
 * Opening an article does not drop the reader into a Wikipedia page. It opens
 * the indusmova breakdown first — the same architecture the Ask view uses:
 *
 *   Breakdown     evidence, the definition, key points, numbered topic blocks
 *                 (short, extendable), facts, sources, method, feedback
 *   Full article  the complete text, re-set in the reading layout with a
 *                 sticky table of contents and the infobox as a factbox
 *   Markdown      the whole thing as Markdown you can copy or download
 *
 * A language bar offers the same topic in the other languages Wikipedia has it
 * in, so the answer is one tap away in the reader's own language.
 */

import { el, clamp, cleanUrl } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { clean, wordCount, collectImages } from '../parse.js';
import { composeAnswer } from '../answer.js';
import { articleToMarkdown, download } from '../markdown.js';
import {
  evidenceStrip, topicBlocks, methodNote, factsBox, sourcesGroup, scopeNote, feedback, referencesBlock,
} from '../answerui.js';
import { sectionHead, card, errorBox, emptyState, toast, breadcrumbs } from '../components.js';
import { mountOpenSources } from './library.js';
import { articleHref, searchHref } from '../router.js';
import { SITE } from '../config.js';
import { describeArticle } from '../meta.js';
import * as api from '../api.js';
import { CONTENT_LANGS } from '../config.js';

const PROJECT_NAMES = {
  wikipedia: 'Wikipedia', wikiquote: 'Wikiquote', wikisource: 'Wikisource',
  wikinews: 'Wikinews', wikibooks: 'Wikibooks', wikiversity: 'Wikiversity',
  wikivoyage: 'Wikivoyage', wiktionary: 'Wiktionary',
};

export async function renderArticle(ctx, route) {
  const title = (route.params.title || '').replace(/_/g, ' ').trim();
  const wrap = el('div', { class: 'wrap' });

  if (!title) {
    wrap.append(emptyState({
      iconName: 'book', title: t('notFound'), body: t('notFoundBody'),
      cta: t('goHome'), ctaHref: '#/',
    }));
    return wrap;
  }

  const mount = el('div');
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${esc(t('loading'))}</p>` }));
  wrap.append(mount);

  const state = {
    lang: route.query?.lang || ctx.state.contentLang,
    project: route.query?.project || 'wikipedia',
    data: null,
    root: null,
    breakdown: null,
    tabs: null,
  };
  ctx.optionsChanged = () => { if (state.breakdown) repaintBreakdown(ctx, state); };
  ctx.onCleanup(() => { ctx.optionsChanged = () => {}; });

  build(ctx, mount, state, title);
  return wrap;
}

async function build(ctx, mount, state, title, retry = 0) {
  try {
    state.data = await ctx.api.article(state.lang, title, { project: state.project });
    state.root = clean(state.data.html);
    state.wikiUrl = `https://${state.lang}.${state.project}.org/wiki/${encodeURIComponent(state.data.title.replace(/ /g, '_'))}`;
    render(ctx, mount, state);
    // The page description comes from the article, not the site default.
    describeArticle(state.root.querySelector('p')?.textContent || state.data.title);
    ctx.pushHistory({
      id: `article:${state.lang}:${state.data.title}`, kind: 'article',
      title: state.data.title, lang: state.lang, url: articleHref(state.data.title, state.lang),
    });
  } catch (err) {
    mount.innerHTML = '';
    const message = err?.status === 404 ? t('notFoundBody') : err?.message;
    mount.append(errorBox(message, { onRetry: () => build(ctx, mount, state, title, retry + 1) }));
    if (err?.name === 'ApiError' && err.status !== 404 && retry === 0) {
      setTimeout(() => build(ctx, mount, state, title, 1), 600);
    }
  }
}

/* ---------------------------------------------------------------- render */

function render(ctx, mount, state) {
  const { data, root, lang, wikiUrl } = state;
  mount.innerHTML = '';

  mount.append(breadcrumbs([
    { label: t('home'), href: '#/' },
    { label: PROJECT_NAMES[state.project] || 'Wikipedia', href: '#/library' },
    { label: data.title },
  ]));

  const head = el('div', { class: 'article-head' });
  const projectName = PROJECT_NAMES[state.project] || 'Wikipedia';
  head.append(el('span', { class: 'kicker', text: `${projectName} · ${lang}.${state.project}.org` }));
  head.append(el('h1', { class: 'article-title', text: data.title }));
  const firstP = root.querySelector('p');
  if (firstP) head.append(el('p', { class: 'article-sub', text: clamp(firstP.textContent, 200) }));
  const words = wordCount(data.html);
  const meta = el('p', { class: 'article-sub', style: 'color:var(--faint);font-size:13px' });
  meta.textContent = `${words.toLocaleString()} ${t('words')} · ~${Math.max(1, Math.round(words / 220))} ${t('minRead')}${data.revid ? ` · ${t('revision')} ${data.revid}` : ''}`;
  head.append(meta);
  mount.append(head);

  mount.append(actions(ctx, state));
  mount.append(languageBar(state));

  const tabs = buildTabs();
  mount.append(tabs.bar);
  state.tabs = tabs;

  const panelBreakdown = el('div', { class: 'tabpanel', role: 'tabpanel' });
  const panelFull = el('div', { class: 'tabpanel', role: 'tabpanel', hidden: true });
  const panelMd = el('div', { class: 'tabpanel', role: 'tabpanel', hidden: true });

  // Breakdown — filled by repaintBreakdown, so depth changes redraw only this.
  const breakdownMount = el('div');
  panelBreakdown.append(breakdownMount);
  state.breakdownMount = breakdownMount;

  // Full article
  panelFull.append(fullArticle(root, data, lang, state));

  // Markdown
  const md = el('div', { class: 'md' });
  const pre = el('pre', { class: 'md-raw' });
  pre.textContent = articleToMarkdown(root, { title: data.title, url: wikiUrl });
  const mdActions = el('div', { class: 'md-actions' });
  const dl = el('button', { type: 'button', class: 'btn btn-primary', html: `${icon('download')}<span>${esc(t('downloadMarkdown'))}</span>` });
  dl.addEventListener('click', () => download(`${data.title.replace(/[^\w\s-]/g, '')}.md`, pre.textContent));
  const cp = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('copy')}<span>${esc(t('copyMarkdown'))}</span>` });
  cp.addEventListener('click', async () => { try { await navigator.clipboard.writeText(pre.textContent); toast(t('copied')); } catch { /* ignore */ } });
  mdActions.append(dl, cp);
  md.append(mdActions, pre);
  panelMd.append(md);

  mount.append(panelBreakdown, panelFull, panelMd);
  tabs.panels = { breakdown: panelBreakdown, full: panelFull, md: panelMd };
  tabs.show('breakdown');

  repaintBreakdown(ctx, state);
  loadRelated(ctx, mount, { title: data.title, lang });
  structuredData(ctx, state);
  openDeepLinkedSection(state, routeOf(ctx));
}

/** Redraw only the breakdown — used on first paint and on a depth change. */
async function repaintBreakdown(ctx, state) {
  const mount = state.breakdownMount;
  if (!mount) return;
  mount.innerHTML = '';
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${esc(t('loading'))}</p>` }));

  let answer;
  try {
    answer = await composeAnswer({
      question: state.data.title,
      root: state.root,
      sections: state.data.sections,
      depth: ctx.state.depth,
      deep: ctx.state.deepRank,
      lang: state.lang,
      title: state.data.title,
      mode: 'article',
      // Opening an article shows the article: every section, in order.
      maxSections: Infinity,
    });
  } catch (err) {
    mount.innerHTML = '';
    mount.append(errorBox(err?.message));
    return;
  }
  answer.wikiUrl = state.wikiUrl;
  answer.revid = state.data.revid;
  state.breakdown = answer;

  mount.innerHTML = '';
  mount.append(jumper(state, answer));
  if (answer.leadImage) {
    const figure = el('figure', { class: 'art-figure', style: 'justify-items:start;margin:0 0 20px' });
    figure.append(el('img', { src: answer.leadImage.src, alt: answer.leadImage.alt || '', loading: 'eager', decoding: 'async' }));
    if (answer.leadImage.caption) figure.append(el('figcaption', { text: answer.leadImage.caption }));
    mount.append(figure);
  }
  mount.append(evidenceStrip({
    matched: answer.method.sentencesMatched,
    considered: answer.method.sentencesConsidered,
    sections: answer.method.sectionsRead,
    title: answer.title,
    deep: ctx.state.deepRank,
  }));

  const qa = el('div', { class: 'qa-answer' });
  qa.append(el('h2', { text: t('answer') }));
  const list = el('ul', { class: 'line-list' });
  (answer.core.length ? answer.core : [clamp(answer.leadText, 320)]).forEach((s) => list.append(el('li', { text: s })));
  qa.append(list);
  mount.append(qa);

  if (answer.keyPoints.length > 1) {
    const card = el('div', { class: 'answer-card' });
    card.append(el('h2', { text: t('keyPoints') }));
    const ol = el('ol', { class: 'points-list' });
    answer.keyPoints.forEach((p) => {
      const li = el('li');
      li.append(el('span', { class: 'point-text', text: p.text }));
      if (p.section) li.append(el('span', { class: 'point-from', text: `— ${p.section}` }));
      ol.append(li);
    });
    card.append(ol);
    mount.append(card);
  }

  if (answer.topics.length) {
    mount.append(sectionHead({ title: t('breakdown') }));
    mount.append(topicBlocks(answer.topics, {
      open: ctx.state.depth === 'deep',
      onGoto: (topic) => gotoSection(state, topic),
    }));
  }

  const facts = factsBox(answer.facts, answer.title);
  if (facts) mount.append(facts);

  mount.append(sourcesGroup({ lang: state.lang, title: answer.title, wikiUrl: state.wikiUrl, citations: answer.citations, project: state.project }));
  mount.append(methodNote(answer.method, { revid: answer.revid, lang: state.lang, title: answer.title, wikiUrl: state.wikiUrl }));
  mount.append(scopeNote(t('scopeAnswer')));
  mount.append(feedback(ctx, `article:${state.lang}:${answer.title}`));
}

/**
 * The section jumper.
 *
 * Every section of the article, numbered, in a panel that stays collapsed
 * until it is asked for — the header's jump button, or the summary line here.
 * Choosing a section scrolls to its block and opens it.
 */
function jumper(state, answer) {
  const wrap = el('div', { class: 'toc-jump', id: 'sectionJump', hidden: true });
  const head = el('div', { class: 'toc-jump-head' });
  head.append(el('h2', { text: `${t('jumpToSection')} (${answer.topics.length})` }));
  const close = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: t('close') });
  close.addEventListener('click', () => {
    wrap.setAttribute('hidden', '');
    document.getElementById('tocBtn')?.setAttribute('aria-expanded', 'false');
  });
  head.append(close);
  wrap.append(head);

  const list = el('ol', { class: 'toc-jump-list' });
  answer.topics.forEach((topic) => {
    const li = el('li');
    const a = el('a', { href: `#${topic.id}` });
    a.append(el('span', { class: 'topic-num', text: String(topic.number) }));
    a.append(el('span', { text: topic.title }));
    a.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.getElementById(`topic-${topic.id}`);
      if (!target) return;
      // Keep the section in the address bar, so the link can be shared.
      const base = location.hash.split('?')[0];
      history.replaceState(null, '', `${base}?s=${encodeURIComponent(topic.id)}`);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Opening a section you asked for is the least surprising behaviour.
      if (!target.classList.contains('is-open')) target.querySelector('.topic-more')?.click();
      wrap.setAttribute('hidden', '');
      document.getElementById('tocBtn')?.setAttribute('aria-expanded', 'false');
    });
    li.append(a);
    list.append(list.children.length ? li : li);
  });
  wrap.append(list);

  // A quiet line under the tabs that opens the same panel.
  const opener = el('button', { type: 'button', class: 'toc-open btn btn-ghost btn-sm', html: `${icon('toc')}<span>${esc(t('jumpToSection'))}</span>` });
  opener.addEventListener('click', () => {
    wrap.removeAttribute('hidden');
    document.getElementById('tocBtn')?.setAttribute('aria-expanded', 'true');
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  const holder = el('div');
  holder.append(opener, wrap);
  return holder;
}

/* ------------------------------------------------------------------ tabs */

function buildTabs() {
  const bar = el('div', { class: 'tabs', role: 'tablist' });
  const buttons = {};
  const api = {
    bar,
    panels: null,
    show(name) {
      for (const [key, panel] of Object.entries(api.panels || {})) panel.hidden = key !== name;
      for (const [key, btn] of Object.entries(buttons)) btn.setAttribute('aria-selected', String(key === name));
      api.current = name;
    },
    current: 'breakdown',
  };
  for (const [name, label] of [['breakdown', t('breakdown')], ['full', t('fullArticle')], ['md', t('markdown')]]) {
    const btn = el('button', { type: 'button', class: 'tab', role: 'tab', text: label, 'aria-selected': 'false' });
    btn.addEventListener('click', () => api.show(name));
    buttons[name] = btn;
    bar.append(btn);
  }
  return api;
}

/** Jump from a topic block to the same section inside the full article. */
function gotoSection(state, topic) {
  state.tabs?.show('full');
  const target = document.getElementById(topic.id);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ------------------------------------------------------------ full article */

function fullArticle(root, data, lang, state) {
  const grid = el('div', { class: 'article-grid' });
  const panel = el('div', { class: 'panel' });
  const prose = el('div', { class: 'prose' });
  prose.innerHTML = root.innerHTML;

  const infobox = prose.querySelector('.infobox, table.infobox');
  const factbox = infobox ? factsBox(factsFrom(infobox), data.title) : null;
  if (infobox) infobox.remove();

  // Tables scroll on their own instead of breaking the column.
  prose.querySelectorAll('table').forEach((table) => {
    const scroll = el('div', { class: 'table-scroll', tabindex: '0' });
    table.replaceWith(scroll);
    scroll.append(table);
  });

  panel.append(prose);
  grid.append(panel);

  const toc = buildToc(data.sections);
  if (toc || factbox) {
    grid.classList.add('rail-open');
    const rail = el('aside', { class: 'toc-rail' });
    if (toc) rail.append(toc);
    if (factbox) rail.append(factbox);
    grid.append(rail);
  }

  const wrap = el('div');
  wrap.append(grid);

  const gallery = buildGallery(root, data.title);
  if (gallery) wrap.append(gallery);

  const references = referencesBlock(root.references || []);
  if (references) wrap.append(references);

  if (toc) observeToc(panel);
  return wrap;
}

function factsFrom(infobox) {
  const facts = [];
  for (const tr of infobox.querySelectorAll('tr')) {
    const th = tr.querySelector('th');
    const td = tr.querySelector('td');
    if (!th || !td) continue;
    const label = th.textContent.replace(/\s+/g, ' ').trim();
    const value = td.textContent.replace(/\s+/g, ' ').trim();
    if (!label || !value || label.length > 60 || value.length > 260) continue;
    facts.push({ label, value });
    if (facts.length >= 14) break;
  }
  return facts;
}

function buildToc(sections) {
  const top = (sections || []).filter((s) => s.level === 2);
  if (top.length < 2) return null;
  const toc = el('div', { class: 'toc' });
  toc.append(el('h3', { text: t('sections') }));
  for (const s of sections) {
    if (s.level > 3) continue;
    const a = el('a', { href: `#${s.id}`, text: s.line, class: s.level === 3 ? 'lvl3' : '' });
    a.addEventListener('click', (event) => {
      event.preventDefault();
      document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    toc.append(a);
  }
  return toc;
}

function observeToc(panel) {
  const links = [...document.querySelectorAll('.toc a')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const map = new Map();
  links.forEach((a) => {
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (target) map.set(target, a);
  });
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((l) => l.classList.remove('active'));
      map.get(entry.target)?.classList.add('active');
    }
  }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
  map.forEach((_, target) => observer.observe(target));
}

function buildGallery(root, title) {
  const imgs = collectImages(root).slice(0, 24);
  if (!imgs.length) return null;
  const section = el('section', { class: 'sec' });
  section.append(sectionHead({ title: t('pictures') }));
  const gallery = el('div', { class: 'gallery' });
  for (const img of imgs) {
    const figure = el('figure');
    figure.append(el('img', { src: img.src, alt: img.alt, loading: 'lazy', decoding: 'async' }));
    const caption = el('figcaption');
    if (img.caption) caption.append(el('span', { text: clamp(img.caption, 160) }));
    // The licence is filled in from Commons below; text licences do not cover
    // the pictures, so each one is checked on its own.
    const credit = el('span', { class: 'imgcredit', text: img.file ? `${img.file} · ${t('loading')}` : '' });
    caption.append(credit);
    figure.append(caption);
    gallery.append(figure);
    if (img.file) loadImageCredit(img.file, credit);
  }
  section.append(gallery);
  return section;
}

/** Ask Commons for one picture's licence and author, and show them. */
async function loadImageCredit(file, node) {
  try {
    const info = await api.imageInfo(file);
    if (!info) { node.textContent = file; return; }
    const bits = [file];
    if (info.artist) bits.push(`${t('imageCredit')}: ${clamp(info.artist, 60)}`);
    if (info.licence) bits.push(`${t('imageLicence')}: ${info.licence}`);
    node.textContent = bits.join(' · ');
    node.title = info.description || file;
  } catch {
    node.textContent = file;
  }
}

/** Article structured data, using only facts that are actually on the page. */
function structuredData(ctx, state) {
  const id = 'indusmova-article-ld';
  document.getElementById(id)?.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = id;
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: state.data.title,
    url: `${SITE.origin}${articleHref(state.data.title, state.lang, state.project).slice(1)}`,
    inLanguage: state.lang,
    isBasedOn: state.wikiUrl,
    license: 'https://creativecommons.org/licenses/by-sa/4.0/',
    publisher: { '@type': 'Organization', name: SITE.name, url: SITE.origin },
    isAccessibleForFree: true,
  });
  document.head.append(script);
}

/** Honour a ?s=section deep link once the blocks exist. */
function openDeepLinkedSection(state, route) {
  const wanted = route?.query?.s;
  if (!wanted) return;
  requestAnimationFrame(() => {
    const target = document.getElementById(`topic-${wanted}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    if (!target.classList.contains('is-open')) target.querySelector('.topic-more')?.click();
  });
}

function routeOf(ctx) { return ctx.route || {}; }

/* --------------------------------------------------------- language bar */

// Languages a reader is most likely to want, in order. Anything not listed
// follows, alphabetically, so the bar shows हिन्दी rather than Aymara.
const LANG_ORDER = ['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'sa', 'as', 'or', 'ne', 'si',
  'ar', 'zh', 'ja', 'ru', 'fr', 'de', 'es', 'pt', 'it', 'id', 'fa', 'tr', 'ko', 'nl', 'pl', 'vi', 'th'];

function languageBar(state) {
  const rank = (code) => {
    const i = LANG_ORDER.indexOf(code);
    return i === -1 ? LANG_ORDER.length + code.charCodeAt(0) : i;
  };
  const links = (state.data.langlinks || [])
    .filter((l) => l.lang !== state.lang)
    .sort((a, b) => rank(a.lang) - rank(b.lang))
    .slice(0, 8);
  if (!links.length) return el('div');
  const bar = el('div', { class: 'langbar' });
  const inner = el('div', { class: 'langbar-inner' });
  inner.append(el('span', { text: `${t('alsoAvailableIn')}:` }));
  const row = el('div', { class: 'pill-row' });
  for (const link of links) {
    const label = CONTENT_LANGS.find((l) => l.code === link.lang)?.native || link.lang.toUpperCase();
    row.append(el('a', { class: 'pill', href: articleHref(link.title, link.lang), text: label }));
  }
  inner.append(row);
  bar.append(inner);
  return bar;
}

/* --------------------------------------------------------------- actions */

function actions(ctx, state) {
  const { data, lang, wikiUrl, root } = state;
  const row = el('div', { class: 'article-actions' });
  const id = `article:${lang}:${data.title}`;

  const save = el('button', { type: 'button', class: `btn btn-ghost${ctx.isBookmarked(id) ? ' is-on' : ''}`, html: `${icon('bookmark')}<span>${esc(ctx.isBookmarked(id) ? t('saved') : t('bookmarks'))}</span>` });
  save.addEventListener('click', () => {
    const saved = ctx.toggleBookmark({
      id, title: data.title, lang, url: articleHref(data.title, lang),
      extract: clamp(root.querySelector('p')?.textContent || '', 160),
    });
    save.innerHTML = `${icon('bookmark')}<span>${esc(saved ? t('saved') : t('bookmarks'))}</span>`;
    save.classList.toggle('is-on', saved);
    toast(saved ? t('saved') : t('remove'));
  });
  row.append(save);

  const copy = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('copy')}<span>${esc(t('copyMarkdown'))}</span>` });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(articleToMarkdown(root, { title: data.title, url: wikiUrl })); toast(t('copied')); }
    catch { toast(t('errorBody')); }
  });
  row.append(copy);

  const dl = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('download')}<span>${esc(t('downloadMarkdown'))}</span>` });
  dl.addEventListener('click', () => download(`${data.title.replace(/[^\w\s-]/g, '')}.md`, articleToMarkdown(root, { title: data.title, url: wikiUrl })));
  row.append(dl);

  const share = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('share')}<span>${esc(t('share'))}</span>` });
  share.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}${articleHref(data.title, lang)}`;
    if (navigator.share) { try { await navigator.share({ title: data.title, url }); } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { /* ignore */ } }
  });
  row.append(share);

  row.append(el('a', { class: 'btn btn-ghost', href: wikiUrl, target: '_blank', rel: 'noopener noreferrer', html: `${esc(t('readOnWikipedia'))} ↗` }));
  return row;
}

async function loadRelated(ctx, mount, { title, lang }) {
  try {
    const related = await ctx.api.related(lang, title);
    if (!related.length) return;
    const section = el('section', { class: 'sec' });
    section.append(sectionHead({ title: t('related'), more: searchHref(title, { lang }) }));
    const grid = el('div', { class: 'grid' });
    related.slice(0, 6).forEach((page) => grid.append(card(page, { lang })));
    section.append(grid);
    mount.append(section);
  } catch { /* bonus */ }
  mountOpenSources(ctx, mount, title);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
