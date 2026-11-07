/* indusmova — the remaining views, in one place.
 *
 * Explore, On this day, Saved, Reading history, Sources, Topics and the static
 * pages (About, Privacy, Terms, Accessibility, Support, Feedback) all share the
 * same small vocabulary of components, so they live together here.
 */

import { el, clamp, cleanUrl } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { SITE, CATEGORIES } from '../config.js';
import { SOURCE_LIST } from '../sources.js';
import { sectionHead, bandHead, card, catCard, skeletonGrid, errorBox, emptyState, toast } from '../components.js';
import { articleHref, searchHref } from '../router.js';

/* ------------------------------------------------------------------ explore */

export async function renderExplore(ctx) {
  const wrap = el('div', { class: 'wrap' });
  wrap.append(head(t('explore'), t('exploreBlurb')));

  const section = el('section');
  section.append(bandHead({ title: t('exploreByCategory'), iconName: 'topics', more: 'topics/' }));
  const grid = el('div', { class: 'cat-grid' });
  for (const cat of CATEGORIES) grid.append(catCard(cat));
  section.append(grid);
  wrap.append(section);

  const mount = el('div');
  mount.append(skeletonGrid(6, 'card'));
  wrap.append(mount);
  loadCurated(ctx, mount);
  return wrap;
}

async function loadCurated(ctx, mount) {
  try {
    const lang = ctx.state.contentLang;
    const featured = await ctx.api.featured(lang);
    let pages = featured.mostread || [];
    if (!pages.length) {
      const rows = await ctx.api.mostRead(lang);
      const found = await ctx.api.summaries(lang, rows.map((r) => r.title));
      pages = rows.map((r) => ({ title: r.title, ...(found.get(r.title) || {}) }));
    }
    if (!pages.length) { mount.innerHTML = ''; return; }
    const section = el('section', { class: 'sec' });
    section.append(sectionHead({ title: t('mostRead'), more: '#/today' }));
    const grid = el('div', { class: 'grid' });
    pages.slice(0, 9).forEach((p) => grid.append(card(p, { lang })));
    section.append(grid);
    mount.innerHTML = '';
    mount.append(section);
  } catch {
    mount.innerHTML = '';
  }
}

/* -------------------------------------------------------------- on this day */

export async function renderToday(ctx, route) {
  const wrap = el('div', { class: 'wrap' });
  wrap.append(head(t('onThisDay'), t('todayBlurb')));

  const now = new Date();
  const month = Number(route.query.m || now.getMonth() + 1);
  const day = Number(route.query.d || now.getDate());

  const picker = el('div', { class: 'tabs' });
  const dateLabel = el('span', {
    style: 'padding:8px 12px;font-size:13.5px',
    text: new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(new Date(2000, month - 1, day)),
  });
  picker.append(dateLabel);
  // A glyph is not a name: these two carry an aria-label so a screen reader
  // announces the day step instead of reading out the character.
  const prev = el('button', { type: 'button', class: 'tab', text: '‹', 'aria-label': t('previousDay'), title: t('previousDay') });
  const next = el('button', { type: 'button', class: 'tab', text: '›', 'aria-label': t('nextDay'), title: t('nextDay') });
  const go = (delta) => {
    let d = new Date(2000, month - 1, day + delta);
    ctx.navigate(`/today?m=${d.getMonth() + 1}&d=${d.getDate()}`);
  };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  picker.append(prev, next);
  wrap.append(picker);

  const mount = el('div');
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${t('loading')}</p>` }));
  wrap.append(mount);
  loadToday(ctx, mount, month, day);
  return wrap;
}

async function loadToday(ctx, mount, month, day) {
  const lang = ctx.state.contentLang;
  try {
    const data = await ctx.api.onThisDay(lang, month, day);
    const events = [...(data.events || []), ...(data.selected || [])];
    mount.innerHTML = '';

    if (!events.length && !(data.births || []).length && !(data.deaths || []).length) {
      mount.append(emptyState({ iconName: 'today', title: t('noEvents'), body: t('todayBlurb'), cta: t('surpriseMe'), ctaHref: '#/today' }));
      return;
    }

    if (events.length) mount.append(timelineSection(t('eventsHeading'), events, lang));
    if ((data.births || []).length) mount.append(listSection(t('birthsHeading'), data.births, lang));
    if ((data.deaths || []).length) mount.append(listSection(t('deathsHeading'), data.deaths, lang));
    if ((data.holidays || []).length) mount.append(listSection(t('holidaysHeading'), data.holidays, lang));
  } catch (err) {
    mount.innerHTML = '';
    mount.append(errorBox(err, { onRetry: () => loadToday(ctx, mount, month, day) }));
  }
}

function timelineSection(title, items, lang) {
  const section = el('section', { class: 'sec' });
  section.append(sectionHead({ title }));
  const ul = el('ul', { class: 'timeline' });
  for (const item of items.slice(0, 20)) {
    const li = el('li');
    const year = item.year != null ? String(item.year) : '';
    const page = item.pages?.[0];
    li.append(el('span', { class: 'yr', text: year }));
    if (page) {
      li.append(el('a', { href: articleHref(page.title, lang), text: (page.title || '').replace(/_/g, ' ') }));
      li.append(document.createTextNode(` — ${clamp(item.text, 200)}`));
    } else {
      li.append(document.createTextNode(clamp(item.text, 220)));
    }
    ul.append(li);
  }
  section.append(ul);
  return section;
}

function listSection(title, items, lang) {
  const section = el('section', { class: 'sec' });
  section.append(sectionHead({ title }));
  const grid = el('div', { class: 'grid' });
  for (const item of items.slice(0, 9)) {
    const page = item.pages?.[0];
    const thumb = page?.thumbnail ? cleanUrl(page.thumbnail.source || page.thumbnail.url) : '';
    grid.append(card({
      title: (page?.title || clamp(item.text, 60)).replace(/_/g, ' '),
      extract: item.text || '',
      thumb: thumb ? { src: thumb } : null,
    }, { lang }));
  }
  section.append(grid);
  return section;
}

/* --------------------------------------------------------------- bookmarks */

export function renderBookmarks(ctx) {
  // The report's P2: local storage is easy to mistake for account sync.
  const wrap = el('div', { class: 'wrap-narrow' });
  wrap.append(head(t('bookmarks'), t('savedBlurb')));
  const mount = el('div');
  wrap.append(mount);

  const paint = () => {
    const list = ctx.getBookmarks();
    mount.innerHTML = '';
    if (!list.length) {
      mount.append(emptyState({ iconName: 'bookmark', title: t('noBookmarks'), body: t('localOnlyNote'), cta: t('explore'), ctaHref: '#/explore' }));
      return;
    }
    const head = el('div', { class: 'dash-band-head' });
    head.append(el('div', { html: `<h2>${esc(t('readingList'))} <span class="more">${list.length}</span></h2>` }));
    const clear = el('button', { type: 'button', class: 'rail-more', text: t('clearAll') });
    clear.addEventListener('click', () => { ctx.clearBookmarks(); paint(); });
    head.append(clear);
    mount.append(head);

    const ul = el('ul', { class: 'saved-list' });
    for (const item of list) {
      const li = el('li', { class: 'saved-item' });
      const a = el('a', { class: 'saved-main', href: item.url || articleHref(item.title, item.lang) });
      if (item.thumb) a.append(el('img', { src: cleanUrl(item.thumb), alt: '', loading: 'lazy' }));
      else a.append(el('span', { class: 'saved-ph', 'aria-hidden': 'true' }));
      const text = el('span', { class: 'saved-text' });
      text.append(el('strong', { text: item.question || item.title }));
      text.append(el('small', { text: item.extract || item.title }));
      a.append(text);
      li.append(a);
      const del = el('button', { type: 'button', class: 'btn btn-ghost btn-icon saved-del', 'aria-label': t('remove'), html: icon('trash') });
      del.addEventListener('click', () => { ctx.removeBookmark(item.id); paint(); toast(t('remove')); });
      li.append(del);
      ul.append(li);
    }
    mount.append(ul);
  };
  paint();
  return wrap;
}

/* --------------------------------------------------------------- history */

export function renderHistory(ctx) {
  const wrap = el('div', { class: 'wrap-narrow' });
  wrap.append(head(t('history'), t('historyBlurb')));
  const mount = el('div');
  wrap.append(mount);

  const paint = () => {
    const list = ctx.getHistory();
    mount.innerHTML = '';
    if (!list.length) {
      mount.append(emptyState({ iconName: 'history', title: t('noHistory'), body: t('exploreBlurb'), cta: t('explore'), ctaHref: '#/explore' }));
      return;
    }
    const head = el('div', { class: 'dash-band-head' });
    head.append(el('div', { html: `<h2>${esc(t('history'))} <span class="more">${list.length}</span></h2>` }));
    const clear = el('button', { type: 'button', class: 'rail-more', text: t('clearHistory') });
    clear.addEventListener('click', () => { ctx.clearHistory(); paint(); });
    head.append(clear);
    mount.append(head);

    const ul = el('ul', { class: 'saved-list' });
    for (const item of list) {
      const li = el('li', { class: 'saved-item' });
      const a = el('a', { class: 'saved-main', href: item.url });
      a.append(el('span', { class: 'saved-ph', 'aria-hidden': 'true', html: icon(item.kind === 'ask' ? 'ask' : 'book') }));
      const text = el('span', { class: 'saved-text' });
      text.append(el('strong', { text: item.question || item.title }));
      text.append(el('small', { text: `${item.kind === 'ask' ? t('ask') : t('readArticle')} · ${new Date(item.readAt).toLocaleString()}` }));
      a.append(text);
      li.append(a);
      ul.append(li);
    }
    mount.append(ul);
  };
  paint();
  return wrap;
}

/* ------------------------------------------------------------------ sources */

/**
 * Who made this, and what it runs on.
 *
 * Every service the site depends on is named here with what it is used for,
 * because a reader checking a fact deserves to know which machine wrote the
 * sentence and which one is holding the page. The marks are drawn from each
 * provider's initials rather than copied artwork: a logo is a trademark, and
 * the honest thing is to name the service and link to it until the owner
 * supplies the official files.
 *
 * The owner's avatar is the brand gradient in CSS: /assets/img/owner.jpg is not
 * in the repository, so no picture is requested and the card still looks
 * finished, with nothing to wire up until the file is added.
 */
const PROVIDERS = '/assets/img/providers';
const CREDITS = [
  { name: 'Mukesh Kumar', role: 'Owner and maintainer', initials: 'MK', owner: true },
  { name: 'Wikipedia', role: 'Article text, pictures and references', href: 'https://www.wikipedia.org', initials: 'W', logo: `${PROVIDERS}/wikipedia.png` },
  { name: 'Wikidata', role: 'Facts and identifiers', href: 'https://www.wikidata.org', initials: 'WD', logo: `${PROVIDERS}/wikidata.svg` },
  { name: 'Wikimedia Commons', role: 'Images and their licences', href: 'https://commons.wikimedia.org', initials: 'WC', logo: `${PROVIDERS}/commons.png` },
  { name: 'Cloudflare Pages', role: 'Hosting and delivery', href: 'https://www.cloudflare.com', initials: 'CF', logo: `${PROVIDERS}/cloudflare.png` },
  { name: 'Workers AI', role: 'Answers when OpenRouter is unavailable', href: 'https://developers.cloudflare.com/workers-ai/', initials: 'AI', logo: `${PROVIDERS}/cloudflare.png` },
  { name: 'OpenRouter', role: 'The language model behind chat answers', href: 'https://openrouter.ai', initials: 'OR' },
  { name: 'Google Translate', role: 'Machine translation of articles', href: 'https://translate.google.com', initials: 'GT', logo: `${PROVIDERS}/translate.png` },
  { name: 'MyMemory', role: 'Fallback translation service', href: 'https://mymemory.translated.net', initials: 'MM' },
];

function creditsSection() {
  const section = el('section', { class: 'sec credits' });
  section.append(sectionHead({ title: t('creditsTitle') }));
  section.append(el('p', { class: 'credits-note', text: t('creditsBody') }));

  const owner = CREDITS.find((c) => c.owner);
  if (owner) {
    const card = el('div', { class: 'credit-owner' });
    card.append(el('div', { class: 'credit-avatar', 'aria-hidden': 'true' }));
    const text = el('div');
    text.append(el('h3', { text: owner.name }));
    text.append(el('p', { text: `${owner.role} · ${t('creditsOwner')}` }));
    card.append(text);
    section.append(card);
  }

  const grid = el('div', { class: 'credit-grid' });
  for (const credit of CREDITS.filter((c) => !c.owner)) {
    const card = el('a', {
      class: 'credit-card',
      href: credit.href,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    // The real mark where one exists, the initials where it does not: both are
    // inside the same tile, so the row keeps one rhythm either way.
    const tile = el('span', { class: `credit-tile${credit.logo ? ' has-logo' : ''}`, 'aria-hidden': 'true' });
    if (credit.logo) tile.append(el('img', { src: credit.logo, alt: '', loading: 'lazy', decoding: 'async' }));
    else tile.textContent = credit.initials;
    card.append(tile);
    const text = el('span', { class: 'credit-text' });
    text.append(el('strong', { text: credit.name }));
    text.append(el('span', { text: credit.role }));
    card.append(text);
    grid.append(card);
  }
  section.append(grid);
  section.append(el('p', { class: 'src-credit', text: t('creditsMarks') }));
  return section;
}

export function renderSources() {
  const wrap = el('div', { class: 'wrap' });
  const head = el('div', { class: 'article-head' });
  head.append(el('span', { class: 'kicker', text: `${SOURCE_LIST.length} open sources · no API keys` }));
  head.append(el('h1', { class: 'article-title', text: t('sources') }));
  head.append(el('p', { class: 'article-sub', text: t('libraryBlurb') }));
  wrap.append(head);
  wrap.append(el('div', { class: 'article-actions', html: `<a class="btn btn-primary" href="#/library">${esc(t('library'))}</a>` }));

  const families = [
    ['Wikimedia', 'wikimedia'],
    ['Books', 'books'],
    ['Research', 'research'],
    ['Archive', 'archive'],
  ];
  for (const [title, family] of families) {
    const list = SOURCE_LIST.filter((s) => s.family === family);
    if (!list.length) continue;
    const section = el('section', { class: 'sec' });
    section.append(sectionHead({ title }));
    const grid = el('div', { class: 'src-grid' });
    for (const source of list) {
      const group = el('div', { class: 'src-group' });
      group.append(el('h3', { html: `<a href="${source.home}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a>` }));
      const ul = el('ul', { class: 'line-list' });
      ul.append(el('li', { html: `<strong>${esc(t('whatItIs'))}:</strong> ${esc(source.kind)}` }));
      ul.append(el('li', { html: `<strong>${esc(t('howToUse'))}:</strong> ${esc(new URL(source.home).host)}` }));
      ul.append(el('li', { html: `<strong>${esc(t('licence'))}:</strong> ${esc(source.licence || '—')}` }));
      group.append(ul);
      grid.append(group);
    }
    section.append(grid);
    wrap.append(section);
  }
  wrap.append(creditsSection());
  wrap.append(el('p', { class: 'ask-note', style: 'margin-top:20px', text: t('attribution') }));
  return wrap;
}

/* ------------------------------------------------------------------- topics */

export function renderTopics(ctx) {
  const wrap = el('div', { class: 'wrap' });
  wrap.append(head(t('topics'), t('topicsBlurb')));
  const grid = el('div', { class: 'topics-grid' });
  CATEGORIES.forEach((cat, i) => {
    const a = el('a', { class: 'topic-card', href: searchHref(cat.query) });
    const topicHead = el('div', { class: 'topic-head' });
    topicHead.append(el('span', { class: 'topic-num', text: String(i + 1) }));
    topicHead.append(el('span', { html: `<strong>${esc(cat.label)}</strong>` }));
    a.append(topicHead);
    a.append(el('p', { text: t('exploreBlurb') }));
    a.append(el('span', { class: 'topic-goto', text: `${t('viewAll')} →` }));
    grid.append(a);
  });
  wrap.append(grid);

  const articles = el('section', { class: 'sec' });
  articles.append(sectionHead({ title: t('fullArticles'), more: '/articles/', moreLabel: t('browseArticles') }));
  articles.append(el('p', { text: t('fullArticlesBlurb') }));
  const cta = el('div', { class: 'article-actions' });
  cta.append(el('a', { class: 'btn btn-primary', href: '/articles/', text: t('browseArticles') }));
  articles.append(cta);
  wrap.append(articles);
  return wrap;
}

/* ------------------------------------------------------------ static pages */

const STATIC = {
  about: {
    title: 'About indusmova',
    body: [
      'indusmova is an independent reader for the free knowledge published by the Wikimedia projects. It takes a question, finds the Wikipedia article that answers it, sifts the article down to the sentences that matter, and lays the result out so it can be read in a minute or studied in depth.',
      'It is not an encyclopedia and it does not write prose. Every sentence shown is quoted from a published article, and every answer links back to the page it came from. Where a claim is contested on Wikipedia, it stays contested here.',
      'Search and article reading happen in your browser: requests go straight from this page to the public Wikimedia APIs. There are no accounts and no tracking, and your bookmarks, reading history and preferences are stored only on your device. Two features do send text out, and both are your choice: Translate sends the article text to a machine-translation service, and Chat sends your question and the selected source excerpts to this site\'s own /api/ask function and on to the configured AI provider (OpenRouter or Cloudflare Workers AI). Those services process the request under their own terms. If you use neither, nothing is sent to any server of ours.'
    ],
  },
  privacy: {
    title: 'Privacy',
    body: [
      'indusmova does not collect personal data. It sets no advertising or analytics cookies, and it does not fingerprint your device.',
      'When you ask a question, your browser contacts the Wikimedia APIs directly. Wikimedia may record that request under its own privacy policy, exactly as it would if you had visited Wikipedia yourself. indusmova never sees it.',
      'Your bookmarks, reading history and preferences are kept in your browser’s local storage. Clearing site data removes them. Nothing is uploaded to us for them.',
      'Translation is the one reading feature that leaves your browser. When you press Translate, the article’s text is sent from this page directly to a machine-translation service — Google Translate first, and MyMemory if Google does not answer — and comes back translated. Those services receive the text you asked to translate and your network request, and they may keep the submitted text under their own terms; MyMemory states that segments may be stored and processed by partner services. Nothing about your bookmarks, history or reading list is sent with it. The original article is never modified, and if you do not use Translate, no text is sent anywhere.',
      'The optional “Understand meaning” feature downloads a small model from a public CDN the first time you switch it on. It runs entirely on your device; your questions are not sent anywhere for it.',
    ],
  },
  terms: {
    title: 'Terms of use',
    body: [
      'indusmova is provided as-is, for reading and research. It comes with no warranty of accuracy or availability.',
      'The content it shows belongs to the Wikimedia community and is reused under the licences described on the Sources & attribution page. You are responsible for respecting those licences when you reuse it.',
      'Do not use indusmova to misrepresent quoted material as original writing, or in any way that breaks the Wikimedia Foundation’s terms of use.',
    ],
  },
  accessibility: {
    title: 'Accessibility',
    body: [
      'indusmova aims to meet WCAG 2.2 level AA. Text is resizable, the interface works with a keyboard alone, and every interactive control has an accessible name.',
      'The interface can follow your system light/dark preference, and a Reading comfort switch makes translucent surfaces fully opaque for readers who find them hard to read.',
      'If something here is not usable for you, please tell us through the Feedback page. Accessibility reports go to the top of the queue.',
    ],
  },
};

export function renderStatic(name) {
  const data = STATIC[name] || { title: t('notFound'), body: [t('notFoundBody')] };
  const wrap = el('div', { class: 'wrap-narrow' });
  const head = el('div', { class: 'article-head' });
  head.append(el('h1', { class: 'article-title', text: data.title }));
  wrap.append(head);
  const page = el('div', { class: 'page' });
  for (const para of data.body) page.append(el('p', { text: para }));
  if (name === 'about') {
    page.append(el('p', { html: `Version <strong>${esc(SITE.version)}</strong> · <a href="${SITE.repo}" target="_blank" rel="noopener noreferrer">Source on GitHub</a>` }));
    page.append(el('p', { html: `Who made it, when, and what it stands on: <a href="#/credits">credits</a>.` }));
  }
  wrap.append(page);
  return wrap;
}

/* ----------------------------------------------------------------- credits */

/*
 * One page that answers the questions a reader reasonably asks of a site like
 * this: who made it, when, on whose shoulders, and what may I reuse.
 *
 * Two rules keep it honest. Every name here is either the maintainer or a
 * project that is genuinely used, and no one is listed who has not agreed to
 * be listed — a credit is not something you can hand someone without asking.
 * The numbers are a snapshot: they were read off the repository on the date in
 * CREDITS_ASOF and are not computed at runtime, because a static page has no
 * business calling the GitHub API to tell you its own history.
 */

const CREDITS_ASOF = '6 November 2026';

const CREDIT_TIMELINE = [
  { date: '20 October 2026', title: 'The first commit', detail: 'The design system is scaffolded and indusmova starts as a folder of plain HTML, CSS and ES modules.' },
  { date: '23 October 2026', title: 'v3.0.0, first public release', detail: 'Ask, Search, Article, On this day, Explore and the Sources page go live on Cloudflare Pages.' },
  { date: '6 November 2026', title: `v${SITE.version}`, detail: '265 commits later: the chat surface, reading progress, thirteen published article pages and the audit fixes.' },
];

const CREDIT_STACK = [
  {
    name: 'Wikipedia',
    what: 'Every sentence the site shows is quoted from a published article. Search, article text and images are fetched live in the browser.',
    licence: 'Text CC BY-SA 4.0 · images per file',
    href: 'https://www.wikipedia.org/',
  },
  {
    name: 'Wikidata',
    what: 'The facts, labels and cross-language titles behind the article cards and the factbox.',
    licence: 'CC0 1.0',
    href: 'https://www.wikidata.org/',
  },
  {
    name: 'Wikimedia Commons',
    what: 'Article images, each shown with the licence it carries on Commons.',
    licence: 'Per file',
    href: 'https://commons.wikimedia.org/',
  },
  {
    name: 'Cloudflare Pages',
    what: 'Hosting, headers and the /api/ask function. The site is static, so there is no build step to deploy.',
    licence: 'Service',
    href: 'https://pages.cloudflare.com/',
  },
  {
    name: 'Cloudflare Workers AI',
    what: 'The optional chat explanation. When it is bound, Cloudflare runs the model and no API key reaches the browser.',
    licence: 'Service',
    href: 'https://developers.cloudflare.com/workers-ai/',
  },
  {
    name: 'OpenRouter',
    what: 'The other, configurable provider for the same optional chat. Its credentials are Cloudflare encrypted secrets.',
    licence: 'Service',
    href: 'https://openrouter.ai/',
  },
  {
    name: 'Transformers.js',
    what: 'Runs the small sentence-embedding model for “Understand meaning” entirely on the reader’s device.',
    licence: 'Apache-2.0',
    href: 'https://github.com/huggingface/transformers.js',
  },
  {
    name: 'Xenova/all-MiniLM-L6-v2',
    what: 'The roughly 23 MB embedding model that re-orders sentences by meaning. Nothing is generated; only the order changes.',
    licence: 'Apache-2.0',
    href: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2',
  },
  {
    name: 'Google Translate & MyMemory',
    what: 'The optional Translate button. Article text goes from the browser straight to one of these services, and back translated.',
    licence: 'Service',
    href: 'https://translate.google.com/',
  },
  {
    name: 'GitHub',
    what: 'The public repository, the issue and pull-request trail, and the Actions that stamp the build and deploy it.',
    licence: 'Service · code MIT',
    href: SITE.repo,
  },
];

const CREDIT_PEOPLE = [
  { name: 'Bhola Kumar', role: 'Design, code, writing and maintenance', commits: '122 commits', href: 'https://github.com/galeoindus' },
  { name: 'indusmova audit', role: 'The repository’s own audit passes, committed by the maintainer', commits: '22 commits' },
  { name: 'github-actions[bot]', role: 'Stamps the build version on every push to main', commits: '110 commits' },
  { name: 'dependabot[bot]', role: 'Dependency updates', commits: '1 commit' },
];

export function renderCredits() {
  const wrap = el('div', { class: 'wrap-narrow' });
  wrap.append(head(t('credits'), 'Who made indusmova, when, and what it stands on.'));

  /* --- the maker ------------------------------------------------------- */
  const maker = el('section', { class: 'credit-maker' });
  const avatar = el('div', { class: 'credit-avatar', 'aria-hidden': 'true' });
  // A photograph is optional. Drop /assets/img/author.jpg into the repository
  // and it appears here; until then the initials stand in, so the page never
  // shows a broken image or an empty circle.
  const photo = el('img', { src: '/assets/img/author.jpg', alt: '', width: '96', height: '96', loading: 'lazy', decoding: 'async' });
  photo.addEventListener('error', () => photo.remove());
  avatar.append(photo, el('span', { class: 'credit-initials', text: 'BK' }));
  maker.append(avatar);

  const who = el('div', { class: 'credit-who' });
  who.append(el('span', { class: 'kicker', text: 'Built and maintained by' }));
  who.append(el('h2', { class: 'credit-name', text: 'Bhola Kumar' }));
  who.append(el('p', { text: 'One person, writing in the open. The site is a reader for free knowledge, not a business: no accounts, no tracking, no advertising.' }));
  const links = el('p', { class: 'credit-links' });
  links.append(el('a', { href: SITE.repo, target: '_blank', rel: 'noopener noreferrer', text: 'Source on GitHub' }));
  links.append(el('span', { text: ' · ' }));
  links.append(el('a', { href: '#/feedback', text: 'Send a correction' }));
  who.append(links);
  maker.append(who);
  wrap.append(maker);

  /* --- the facts ------------------------------------------------------- */
  const facts = el('dl', { class: 'credit-facts' });
  for (const [label, value] of [
    ['Started', '20 October 2026'],
    ['First public release', 'v3.0.0, 23 October 2026'],
    ['Running now', `v${SITE.version}`],
    ['Commits', '265'],
    ['Code licence', 'MIT'],
  ]) {
    facts.append(el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]));
  }
  wrap.append(facts);

  /* --- the timeline ---------------------------------------------------- */
  const history = el('section', { class: 'sec' });
  history.append(sectionHead({ title: 'How it was made' }));
  const ol = el('ol', { class: 'credit-timeline' });
  for (const step of CREDIT_TIMELINE) {
    const li = el('li');
    li.append(el('span', { class: 'credit-when', text: step.date }));
    li.append(el('strong', { text: step.title }));
    li.append(el('p', { text: step.detail }));
    ol.append(li);
  }
  history.append(ol);
  wrap.append(history);

  /* --- the stack ------------------------------------------------------- */
  const stack = el('section', { class: 'sec' });
  stack.append(sectionHead({ title: 'What it stands on' }));
  stack.append(el('p', { text: 'indusmova writes none of its own facts. Everything below is a project or a service the site actually uses, and each is credited for what it actually does.' }));
  const grid = el('div', { class: 'src-grid' });
  for (const item of CREDIT_STACK) {
    const group = el('div', { class: 'src-group' });
    group.append(el('h3', { html: `<a href="${item.href}" target="_blank" rel="noopener noreferrer">${esc(item.name)}</a>` }));
    group.append(el('p', { text: item.what }));
    group.append(el('p', { class: 'credit-licence', text: item.licence }));
    grid.append(group);
  }
  stack.append(grid);
  wrap.append(stack);

  /* --- AI assistance --------------------------------------------------- */
  const ai = el('section', { class: 'sec' });
  ai.append(sectionHead({ title: 'AI assistance, stated plainly' }));
  ai.append(el('p', { text: 'Parts of the code, the copy and the audits were written with AI assistants, including Sarvam AI. Every change was read, tested and accepted by the maintainer before it was committed, and the maintainer is the author of record and takes responsibility for what the site says.' }));
  ai.append(el('p', { text: 'The AI is credited here for the work it did. It is not credited as an author, because it cannot check a claim, answer for a mistake, or hold a licence.' }));
  wrap.append(ai);

  /* --- the people ------------------------------------------------------ */
  const people = el('section', { class: 'sec' });
  people.append(sectionHead({ title: 'Everyone who has contributed' }));
  people.append(el('p', { text: `Read off the repository’s own history on ${CREDITS_ASOF}. Most of the entries are automation; no outside human has contributed code yet.` }));
  const list = el('ul', { class: 'credit-people' });
  for (const person of CREDIT_PEOPLE) {
    const li = el('li');
    const name = person.href
      ? el('a', { href: person.href, target: '_blank', rel: 'noopener noreferrer', text: person.name })
      : el('strong', { text: person.name });
    li.append(el('span', { class: 'credit-person-name' }, [name]));
    li.append(el('span', { class: 'credit-person-role', text: person.role }));
    li.append(el('span', { class: 'credit-person-count', text: person.commits }));
    list.append(li);
  }
  people.append(list);
  people.append(el('p', { class: 'ask-note', text: 'A pull request that lands is credited in the commit history and can be added to this list on request. Nobody is listed here without agreeing to it, and anyone can ask to be removed.' }));
  wrap.append(people);

  /* --- licences and independence --------------------------------------- */
  const legal = el('section', { class: 'sec' });
  legal.append(sectionHead({ title: 'Licences and independence' }));
  legal.append(el('ul', { class: 'line-list', html: [
    '<li><strong>indusmova’s own code</strong> — MIT. Copy it, change it, ship it; keep the notice.</li>',
    '<li><strong>Wikipedia article text</strong> — CC BY-SA 4.0, and it stays under that licence wherever you reuse it.</li>',
    '<li><strong>Wikidata</strong> — CC0 1.0.</li>',
    '<li><strong>Wikimedia Commons files</strong> — each file’s own licence, shown with the image.</li>',
    '<li><strong>Not affiliated</strong> — indusmova is an independent reader. It is not endorsed by or connected to the Wikimedia Foundation, Cloudflare, OpenRouter or any AI provider named above.</li>',
  ].join('') }));
  legal.append(el('p', { class: 'ask-note', text: 'Something missing, wrong, or listed without permission? Use the Feedback page and it will be corrected.' }));
  wrap.append(legal);

  return wrap;
}

/* ----------------------------------------------------------------- support */

const HELP_LINES = [
  { num: '112', name: 'All emergencies', detail: 'One number for police, fire and ambulance, anywhere in India. 24×7.' },
  { num: '14416', name: 'Tele-MANAS', detail: 'Free mental-health support from the Government of India. Toll-free, 24×7, in many languages.' },
  { num: '1098', name: 'Childline', detail: 'For children in distress or at risk. 24×7, free.' },
  { num: '181', name: 'Women’s helpline', detail: 'Support for women facing violence or distress. 24×7.' },
  { num: '14567', name: 'Elder Line', detail: 'For older people who need help or protection. Toll-free, 24×7.' },
];

export function renderSupport() {
  const wrap = el('div', { class: 'wrap-narrow' });
  wrap.append(head(t('supportLink'), 'indusmova is a reading tool, not a source of advice.'));

  const help = el('div', { class: 'crisis-help shown' });
  help.append(el('p', { class: 'crisis-where', text: 'If you are in distress, these lines are free, confidential and answered by people.' }));

  for (const line of HELP_LINES) {
    const a = el('a', { class: 'crisis-line', href: `tel:${line.num}` });
    a.append(el('span', { class: 'num', text: line.num }));
    const meta = el('span', { class: 'meta' });
    meta.append(el('span', { class: 'name', text: line.name }));
    meta.append(el('span', { class: 'detail', text: line.detail }));
    a.append(meta);
    help.append(a);
  }

  help.append(el('p', { class: 'crisis-emergency', html: 'If you or someone else is in immediate danger, call <strong>112</strong> now.' }));

  const actions = el('div', { class: 'crisis-actions' });
  actions.append(el('a', { class: 'crisis-btn', href: '#/feedback', text: 'Report a problem with indusmova' }));
  actions.append(el('a', { class: 'crisis-btn', href: '#/', text: 'Back to indusmova' }));
  help.append(actions);

  wrap.append(help);
  wrap.append(el('p', { class: 'ask-note', style: 'margin-top:20px', text: 'indusmova cannot help with a medical, legal or personal emergency, and it cannot contact anyone for you. For problems with the site itself — a broken page, a wrong answer, an accessibility barrier — use the Feedback page.' }));
  return wrap;
}

/* ----------------------------------------------------------------- feedback */

export function renderFeedback(ctx) {
  const wrap = el('div', { class: 'wrap-narrow' });
  wrap.append(head(t('feedback'), 'Tell us what worked and what did not.'));

  const form = el('form', { class: 'panel', style: 'display:grid;gap:14px' });
  const kind = el('select', { class: 'select', name: 'kind', 'aria-label': 'Feedback type' });
  for (const [value, label] of [['bug', 'Something is broken'], ['wrong', 'An answer is wrong'], ['idea', 'An idea'], ['a11y', 'An accessibility problem']]) {
    kind.append(el('option', { value, text: label }));
  }
  form.append(field('Feedback type', kind));
  const message = el('textarea', { class: 'searchbar', name: 'message', rows: '5', required: true, placeholder: 'What happened, and where?' });
  message.style.display = 'block';
  form.append(field('Message', message));
  const email = el('input', { class: 'searchbar', type: 'email', name: 'email', placeholder: 'Email (optional)' });
  email.style.display = 'block';
  form.append(field('Your email', email));
  const submit = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Send feedback', style: 'justify-self:start' });
  form.append(submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // No backend: open the reader's own mail client, pre-filled. Nothing is
    // transmitted by the site itself.
    const subject = encodeURIComponent(`[indusmova] ${kind.value}`);
    // If the reader gave an address, it belongs in the draft — asking for it
    // and then dropping it would be worse than not asking (F-12).
    const contact = email.value.trim();
    const body = encodeURIComponent(
      [message.value, contact ? `\n\nReply to: ${contact}` : '', '\n\n— sent from indusmova'].join(''),
    );
    window.location.href = `mailto:bholasee8816@gmail.com?subject=${subject}&body=${body}`;
    toast('Opening your email app — nothing is sent until you send it there.');
  });

  wrap.append(form);
  wrap.append(el('p', { class: 'ask-note', style: 'margin-top:18px', text: 'Feedback opens in your own email app. Nothing is sent anywhere until you press send there.' }));
  return wrap;
}

function field(label, control) {
  const wrap = el('label', { style: 'display:grid;gap:6px;font-size:13.5px;color:var(--muted)' });
  wrap.append(el('span', { text: label }));
  wrap.append(control);
  return wrap;
}

/* ------------------------------------------------------------------ 404 */

export function renderNotFound() {
  const wrap = el('div', { class: 'wrap-narrow' });
  wrap.append(emptyState({
    iconName: 'search',
    title: t('notFound'),
    body: t('notFoundBody'),
    cta: t('goHome'),
    ctaHref: '#/',
  }));
  return wrap;
}

/* ------------------------------------------------------------------ helper */

function head(title, blurb) {
  const wrap = el('div', { class: 'article-head' });
  wrap.append(el('h1', { class: 'article-title', text: title }));
  if (blurb) wrap.append(el('p', { class: 'article-sub', text: blurb }));
  return wrap;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
