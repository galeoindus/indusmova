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

import { el, clamp, esc, prefersReducedMotion } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { clean, wordCount, proseText, splitArticle, paragraphsToPoints } from '../parse.js';
import { factsFromInfobox } from '../answer.js';
import { articleToMarkdown } from '../markdown.js';
import {
  factsBox, sourcesGroup, feedback, referencesBlock, markdownActions,
} from '../answerui.js';
import { sectionHead, card, errorBox, emptyState, toast, breadcrumbs } from '../components.js';
import { mountOpenSources } from './library.js';
import { articleHref, searchHref } from '../router.js';
import { updateRouteMetadata, setArticleStructuredData, markContentLang, pathFor } from '../meta.js';
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
    tabs: null,
  };
  ctx.optionsChanged = () => { if (state.root) repaintFull(ctx, state); };
  ctx.toggleToc = () => toggleToc(state);
  ctx.onCleanup(() => { ctx.optionsChanged = () => {}; ctx.toggleToc = null; });

  build(ctx, mount, state, title);
  return wrap;
}

async function build(ctx, mount, state, title, retry = 0) {
  try {
    state.data = await ctx.api.article(state.lang, title, { project: state.project });
    ctx.api.revisionInfo(state.lang, state.data.revid, { project: state.project })
      .then((rev) => {
        state.revision = rev;
        renderRevisionLine(state);
        // The sources block shows the revision too, so replace it in place.
        const old = document.getElementById('sourcesBlock');
        if (old && rev) {
          const fresh = sourcesGroup({
            lang: state.lang, title: state.data.title, wikiUrl: state.wikiUrl,
            citations: state.answer?.citations || [], project: state.project, revision: rev,
          });
          fresh.id = 'sourcesBlock';
          old.replaceWith(fresh);
        }
      })
      .catch(() => {});
    state.root = clean(state.data.html);
    state.wikiUrl = `https://${state.lang}.${state.project}.org/wiki/${encodeURIComponent(state.data.title.replace(/ /g, '_'))}`;
    render(ctx, mount, state);
    publishMetadata(ctx, state);
    ctx.pushHistory({
      id: `article:${state.lang}:${state.data.title}`, kind: 'article',
      title: state.data.title, lang: state.lang, url: articleHref(state.data.title, state.lang),
    });
  } catch (err) {
    mount.innerHTML = '';
    const message = err?.status === 404 ? t('notFoundBody') : err?.message;
    mount.append(errorBox(message, { onRetry: () => build(ctx, mount, state, title, retry + 1), query: title }));
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
  mount.append(actionsRow(ctx, state));

  mount.append(languageBar(state));

  const tabs = buildTabs();
  mount.append(tabs.bar);
  state.tabs = tabs;

  const panelFull = el('div', { class: 'tabpanel', role: 'tabpanel', id: 'tab-panel-full', 'aria-labelledby': 'tab-full', tabindex: '0' });
  const panelMd = el('div', { class: 'tabpanel', role: 'tabpanel', id: 'tab-panel-md', 'aria-labelledby': 'tab-md', hidden: true });

  // The article — filled by repaintFull, in the site's own architecture.
  const fullMount = el('div');
  panelFull.append(fullMount);
  state.fullMount = fullMount;

  // Markdown
  const md = el('div', { class: 'md' });
  const pre = el('pre', { class: 'md-raw' });
  pre.textContent = articleToMarkdown(root, { title: data.title, url: wikiUrl });
  md.append(markdownActions({
    getText: () => pre.textContent,
    filename: data.title,
  }), pre);
  panelMd.append(md);

  mount.append(panelFull, panelMd);
  tabs.panels = { full: panelFull, md: panelMd };
  tabs.show('full');

  repaintFull(ctx, state);
  loadRelated(ctx, mount, { title: data.title, lang });
  openDeepLinkedSection(state, routeOf(ctx));
}

/**
 * The section jumper, as a reading-progress contents list.
 *
 * The current practice for long articles is a contents panel that shows how
 * far through the reader is, marks which sections are done, and stays out of
 * the way until it is asked for. So: collapsed by default, opened from the
 * header button or the button above the tabs, and closed again by choosing a
 * section or pressing Close.
 *
 * Every item is a real link with a stable id, `aria-current` marks the section
 * being read, and the progress is given as text as well as a bar, so it is not
 * colour alone.
 */
export function jumper(state, answer, idPrefix = 'topic') {
  const topics = answer.topics || [];
  const wrap = el('div', { class: 'toc-jump', id: 'sectionJump' });

  const minutes = Math.max(1, Math.round(wordCount(state.data.html) / 220));
  const head = el('div', { class: 'toc-jump-head' });
  const title = el('div');
  title.append(el('h2', { text: t('jumpToSection') }));
  const meta = el('p', { class: 'toc-jump-meta' });
  meta.append(el('span', { id: 'tocRead', text: `0 ${t('ofWord')} ${topics.length} ${t('sectionsWord')}` }));
  meta.append(el('span', { text: ` · ${t('aboutWord')} ${minutes} ${t('minLeft')}` }));
  title.append(meta);
  head.append(title);
  const close = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: t('close') });
  head.append(close);
  wrap.append(head);

  const bar = el('div', { class: 'toc-jump-bar', 'aria-hidden': 'true', html: '<span></span>' });
  wrap.append(bar);

  const list = el('ol', { class: 'toc-jump-list' });
  const links = new Map();
  topics.forEach((topic) => {
    const li = el('li', { class: 'is-unread' });
    const a = el('a', { href: `#${topic.id}` });
    a.append(el('span', { class: 'toc-mark', 'aria-hidden': 'true' }));
    a.append(el('span', { class: 'topic-num', text: String(topic.number) }));
    a.append(el('span', { class: 'toc-label', text: topic.title }));
    a.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.getElementById(`${idPrefix}-${topic.id}`);
      if (!target) return;
      // Keep the section in the address bar, so the link can be shared.
      const base = location.hash.split('?')[0];
      history.replaceState(null, '', `${base}?s=${encodeURIComponent(topic.id)}`);
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      if (!target.classList.contains('is-open')) target.querySelector('.topic-more')?.click();
      // Jumping is a navigation, not a request to close the contents: leave the
      // rail open so the reader can jump again.
    });
    li.append(a);
    links.set(topic.id, li);
    list.append(li);
  });
  wrap.append(list);

  // Closing hides the contents panel, the same thing the header button does.
  close.addEventListener('click', () => {
    wrap.closest('.toc-top')?.setAttribute('hidden', '');
    document.getElementById('tocBtn')?.setAttribute('aria-expanded', 'false');
  });

  // Track the reader's position and mark sections read / being read.
  const observer = observeSections(topics, links, bar, idPrefix);
  if (observer) state.tocObserver = observer;

  return wrap;
}

/**
 * Mark a section read once its heading has passed, and the current one as it
 * arrives. The counts are text, so the state is not carried by colour alone.
 */
function observeSections(topics, links, bar, idPrefix = 'topic') {
  if (!('IntersectionObserver' in window) || !topics.length) return null;
  const seen = new Set();
  let current = '';
  const readNode = () => document.getElementById('tocRead');

  const paint = () => {
    const total = topics.length || 1;
    const pct = Math.round((seen.size / total) * 100);
    const fill = bar.querySelector('span');
    if (fill) fill.style.width = `${pct}%`;
    const node = readNode();
    if (node) node.textContent = `${seen.size} ${t('ofWord')} ${topics.length} ${t('sectionsWord')} · ${pct}% ${t('readWord')}`;
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const id = entry.target.id.replace(new RegExp(`^${idPrefix}-`), '');
      const li = links.get(id);
      if (!li) continue;
      if (entry.isIntersecting && id !== current) {
        current = id;
        for (const [, other] of links) {
          other.classList.remove('is-current');
          other.querySelector('a')?.removeAttribute('aria-current');
        }
        li.classList.add('is-current');
        li.querySelector('a')?.setAttribute('aria-current', 'true');
      }
      // A section above the reading line counts as read.
      if (entry.boundingClientRect.top < 0) {
        seen.add(id);
        li.classList.remove('is-unread');
        li.classList.add('is-read');
      }
    }
    paint();
  }, { rootMargin: '-90px 0px -60% 0px', threshold: 0 });

  for (const topic of topics) {
    const target = document.getElementById(`${idPrefix}-${topic.id}`);
    if (target) observer.observe(target);
  }
  paint();
  return observer;
}

/* ------------------------------------------------------------------ tabs */

/**
 * The article tabs, following the WAI-ARIA tabs pattern (F-07).
 *
 * Every tab and panel has an id, `aria-controls` and `aria-labelledby`; the
 * tablist has one roving tab stop; Arrow keys move between tabs (wrapping),
 * Home/End jump to the ends, and focus follows selection.
 */
function buildTabs() {
  const TABS = [
    { name: 'full', label: t('fullArticle') },
    { name: 'md', label: t('markdown') },
  ];
  const uid = 'tab';
  const bar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': t('fullArticle') });
  const buttons = {};
  const api = {
    bar,
    panels: null,
    current: TABS[0].name,
    show(name, { focus = false } = {}) {
      for (const [key, panel] of Object.entries(api.panels || {})) {
        const active = key === name;
        panel.hidden = !active;
        if (active) panel.setAttribute('tabindex', '0'); else panel.removeAttribute('tabindex');
      }
      for (const [key, btn] of Object.entries(buttons)) {
        const active = key === name;
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
        if (active && focus) btn.focus();
      }
      api.current = name;
    },
  };

  TABS.forEach(({ name, label }, index) => {
    const btn = el('button', {
      type: 'button', class: 'tab', role: 'tab', id: `${uid}-${name}`,
      'aria-selected': String(index === 0), 'aria-controls': `${uid}-panel-${name}`,
      tabIndex: index === 0 ? 0 : -1, text: label,
    });
    btn.addEventListener('click', () => api.show(name));
    btn.addEventListener('keydown', (event) => {
      const keys = { ArrowRight: 1, ArrowLeft: -1 };
      let next = null;
      if (event.key in keys) next = (index + keys[event.key] + TABS.length) % TABS.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = TABS.length - 1;
      if (next == null) return;
      event.preventDefault();
      api.show(TABS[next].name, { focus: true });
    });
    buttons[name] = btn;
    bar.append(btn);
  });
  return api;
}

/* ------------------------------------------------------------ full article */

/**
 * The Full article tab, in the site's own architecture.
 *
 * The reader asked for the whole article to read the way an answer reads —
 * not as a Wikipedia page. So every section is shown as a topic block, all
 * extended so nothing is hidden, under the same evidence strip, key points,
 * facts, sources and method note the breakdown uses. The numbered references
 * and the picture gallery are kept, because they belong to the article.
 */
async function repaintFull(ctx, state) {
  const mount = state.fullMount;
  if (!mount) return;
  mount.innerHTML = '';
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${esc(t('loading'))}</p>` }));

  let parts;
  try {
    parts = splitArticle(state.root, state.data.sections);
  } catch (err) {
    mount.innerHTML = '';
    mount.append(errorBox(err, { query: state.data?.title || '' }));
    return;
  }

  const facts = factsFromInfobox(parts.infoboxHtml);
  const topics = parts.sections.map((s, i) => ({ id: s.id, title: s.line, number: s.number || String(i + 1) }));

  mount.innerHTML = '';
  mount.append(tocTop(state, { topics }, 'full-topic'));
  const content = el('div', { class: 'panel panel-wide' });
  mount.append(content);

  // The infobox sits at the top, where Wikipedia keeps it, as our facts box.
  const factbox = factsBox(facts, state.data.title);
  if (factbox) content.append(factbox);

  // The lead, then every section, in Wikipedia's own order — but read as
  // points, with the pictures and tables left where Wikipedia puts them.
  if (parts.leadHtml.trim()) content.append(articleSection({ html: parts.leadHtml, id: 'full-topic-lead' }));
  for (const section of parts.sections) {
    content.append(articleSection({ html: section.html, title: section.line, id: `full-topic-${section.id}`, number: section.number }));
  }

  const references = (state.root.references || []).length
    ? referencesBlock(state.root.references)
    : emptyReferences();
  if (references) content.append(references);

  content.append(sourcesGroup({
    lang: state.lang, title: state.data.title, wikiUrl: state.wikiUrl,
    citations: parts.citations, project: state.project, revision: state.revision,
  }));
  content.append(feedback(ctx, `article:${state.lang}:${state.data.title}`));
}

/**
 * One part of the article: its heading, then its body read as points.
 *
 * Wikipedia's own order is kept — a picture or a table stays exactly where it
 * sits in the text — but every paragraph is re-read as one point per sentence,
 * the way the rest of the site reads. The pictures are centred.
 */
function articleSection({ html, title, id, number }) {
  const section = el('section', { class: 'art-section', id });
  if (title) {
    const head = el('h2', { class: 'art-section-head' });
    if (number) head.append(el('span', { class: 'topic-num', text: String(number) }));
    head.append(el('span', { text: title }));
    section.append(head);
  }
  const body = el('div', { class: 'prose art-body' });
  body.innerHTML = html;
  // The infobox becomes the facts box; it is not repeated in the text.
  body.querySelectorAll('table.infobox, .infobox').forEach((node) => node.remove());
  paragraphsToPoints(body);
  // A wide table scrolls on its own rather than breaking the column.
  body.querySelectorAll('table').forEach((table) => {
    const scroll = el('div', { class: 'table-scroll', tabindex: '0' });
    table.replaceWith(scroll);
    scroll.append(table);
  });
  section.append(body);
  return section;
}

function publishMetadata(ctx, state) {
  const lead = proseText(state.root.querySelector('p') || state.root).slice(0, 300);
  const title = `${state.data.title} — indusmova`;
  updateRouteMetadata(ctx.route, {
    title,
    description: lead || state.data.title,
    image: state.data.thumb || undefined,
    type: 'article',
  });
  setArticleStructuredData({
    headline: state.data.title,
    description: lead.slice(0, 200),
    url: pathFor(ctx.route),
    lang: state.lang,
    isBasedOn: state.wikiUrl,
    // Only when the source actually reported one.
    dateModified: state.revision?.timestamp || undefined,
  });
  // The chrome may be English while the article is Hindi or Urdu.
  markContentLang(document.getElementById('main'), state.lang);
}

/** Honour a ?s=section deep link once the blocks exist. */
function openDeepLinkedSection(state, route) {
  const wanted = route?.query?.s;
  if (!wanted) return;
  requestAnimationFrame(() => {
    const target = document.getElementById(`full-topic-${wanted}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
  });
}

function routeOf(ctx) { return ctx.route || {}; }

/**
 * Give every citation marker a name a screen reader can use.
 *
 * "[2]" alone tells a reader nothing. Each marker becomes "Open source 2,
 * section 'Causes'" using the heading it sits under.
 */
function emptyReferences() {
  const box = el('section', { class: 'sec' });
  box.append(el('div', { class: 'sec-head', html: `<h2>${esc(t('references'))}</h2><span class="more">0</span>` }));
  box.append(el('p', { class: 'src-credit', text: t('noReferences') }));
  return box;
}

/**
 * "Source revision as of 14 October 2026", linked to that exact revision, so a
 * reader can see what the article said when they read it (F-18). The ordinary
 * "Read on Wikipedia" link still goes to the current article.
 */
function renderRevisionLine(state) {
  const node = document.getElementById('revLine');
  if (!node || !state.revision) return;
  const when = new Date(state.revision.timestamp);
  const stamp = Number.isNaN(when.getTime())
    ? state.revision.timestamp
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(when);
  node.textContent = '';
  node.append(document.createTextNode(`${t('sourceRevision')} `));
  node.append(el('a', {
    href: state.revision.url,
    target: '_blank',
    rel: 'noopener noreferrer',
    text: stamp,
  }));
  if (state.revision.user) node.append(document.createTextNode(` · ${state.revision.user}`));
  node.append(document.createTextNode(` · ${t('revisionId')} ${state.revision.revid}`));
}

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

/* ----------------------------------------------------- contents & actions */

/** The contents panel, at the top of a tab, collapsed until asked for. */
function tocTop(state, answer, idPrefix) {
  const holder = el('div', { class: 'toc-top', id: `tocTop-${idPrefix}`, hidden: true });
  holder.append(jumper(state, answer, idPrefix));
  return holder;
}

/** Show or hide the contents panel inside `scope` (a view or a tab panel). */
export function toggleContents(scope) {
  const holder = scope?.querySelector?.('.toc-top');
  if (!holder) { toast(t('noSectionsHere')); return; }
  const open = holder.hasAttribute('hidden');
  if (open) holder.removeAttribute('hidden'); else holder.setAttribute('hidden', '');
  document.getElementById('tocBtn')?.setAttribute('aria-expanded', String(open));
  if (open) holder.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
}

/** Show or hide the contents panel of whichever article tab is open. */
function toggleToc(state) {
  toggleContents(document.querySelector('.tabpanel:not([hidden])'));
}

/* --------------------------------------------------------------- actions */

/**
 * The article's actions, returned as separate controls so the view can place
 * them in the rail rather than in a row across the top.
 */
function actionControls(ctx, state) {
  const { data, lang, wikiUrl, root } = state;
  const out = [];
  const id = `article:${lang}:${data.title}`;

  const save = el('button', { type: 'button', class: `btn btn-ghost${ctx.isBookmarked(id) ? ' is-on' : ''}`, html: `${icon('bookmark')}<span>${esc(ctx.isBookmarked(id) ? t('savedOnDevice') : t('bookmarks'))}</span>` });
  save.addEventListener('click', () => {
    const saved = ctx.toggleBookmark({
      id, title: data.title, lang, url: articleHref(data.title, lang),
      extract: clamp(root.querySelector('p')?.textContent || '', 160),
    });
    save.innerHTML = `${icon('bookmark')}<span>${esc(saved ? t('savedOnDevice') : t('bookmarks'))}</span>`;
    save.classList.toggle('is-on', saved);
    toast(saved ? t('savedOnDevice') : t('removedFromSaved'));
  });
  out.push(save);

  out.push(markdownActions({
    getText: () => articleToMarkdown(root, { title: data.title, url: wikiUrl }),
    filename: data.title,
  }));

  const share = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('share')}<span>${esc(t('share'))}</span>` });
  share.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}${articleHref(data.title, lang)}`;
    if (navigator.share) { try { await navigator.share({ title: data.title, url }); } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { /* ignore */ } }
  });
  out.push(share);

  out.push(el('a', { class: 'btn btn-ghost', href: wikiUrl, target: '_blank', rel: 'noopener noreferrer', html: `${icon('external')}<span>${esc(t('readOnWikipedia'))}</span>` }));
  return out;
}

/** The article's controls as one clean row above the tabs. */
function actionsRow(ctx, state) {
  const row = el('div', { class: 'art-actions' });
  for (const control of actionControls(ctx, state)) row.append(control);
  const jump = el('button', {
    type: 'button', class: 'btn btn-ghost',
    html: `${icon('list')}<span>${esc(t('jumpToSection'))}</span>`,
  });
  jump.addEventListener('click', () => toggleToc(state));
  row.append(jump);
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

