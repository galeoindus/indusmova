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
import { sectionHead, bandHead, card, catCard, srcRow, skeletonGrid, errorBox, emptyState, toast } from '../components.js';
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
  const prev = el('button', { type: 'button', class: 'tab', text: '‹' });
  const next = el('button', { type: 'button', class: 'tab', text: '›' });
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
      mount.append(emptyState({ iconName: 'bookmark', title: t('noBookmarks'), body: t('savedBlurb'), cta: t('explore'), ctaHref: '#/explore' }));
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
  wrap.append(head(t('history'), t('noHistory')));
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
      'The whole product runs in the browser. There are no accounts, no server of ours in the path, and no tracking. Your bookmarks, your reading history and your preferences are stored only on your device.',
    ],
  },
  privacy: {
    title: 'Privacy',
    body: [
      'indusmova does not collect personal data. It sets no advertising or analytics cookies, and it does not fingerprint your device.',
      'When you ask a question, your browser contacts the Wikimedia APIs directly. Wikimedia may record that request under its own privacy policy, exactly as it would if you had visited Wikipedia yourself. indusmova never sees it.',
      'Your bookmarks, reading history and preferences are kept in your browser’s local storage. Clearing site data removes them. Nothing is uploaded.',
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
  }
  wrap.append(page);
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
  wrap.append(el('p', { class: 'ask-note', style: 'margin-top:18px', text: 'Feedback opens in your own email app. indusmova has no server, so nothing is sent until you press send there.' }));
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
