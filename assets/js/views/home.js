/* indusmova — the home dashboard.
 *
 * The page the snapshot showed: a hero with the composer, the six quick
 * actions, article of the day, popular questions, categories, how it works and
 * the most-read band. Everything below the fold loads after first paint so the
 * hero is interactive immediately.
 */

import { el, clamp, cleanUrl, clockParts } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { CATEGORIES, QUICK_CHIPS, EXAMPLE_PROMPTS, ASK_CHIPS } from '../config.js';
import { sectionHead, bandHead, card, qCard, catCard, skeletonGrid, rowCta } from '../components.js';
import { composerForm, depthControl, chipRow, attachSuggest } from '../composer.js';
import { articleHref } from '../router.js';

const POPULAR = [
  { question: 'Who was Ashoka?', title: 'Ashoka', tag: 'History' },
  { question: 'When did Chandrayaan-3 land on the Moon?', title: 'Chandrayaan-3', tag: 'Space & Astronomy' },
  { question: 'What is photosynthesis?', title: 'Photosynthesis', tag: 'Science & Technology' },
  { question: 'Who invented the World Wide Web?', title: 'World Wide Web', tag: 'Science & Technology' },
];

export async function renderHome(ctx) {
  const dash = el('div', { class: 'dash' });
  dash.append(hero(ctx));
  dash.append(actions());
  dash.append(nudge(ctx));
  dash.append(aotdMount(ctx));
  dash.append(questionsMount(ctx));
  dash.append(categories());
  dash.append(howItWorks());
  dash.append(trendingMount(ctx));
  dash.append(askBand(ctx));
  return dash;
}

/* -------------------------------------------------------------------- hero */

function hero(ctx) {
  const section = el('section', { class: 'dash-hero', id: 'dashHero' });

  section.append(el('span', {
    class: 'dash-hero-badge',
    html: `${icon('check')}${esc(t('heroBadge'))}`,
  }));
  section.append(el('h1', {
    html: `<span>${esc(t('heroFrom'))}</span> <span class="dash-grad">${esc(t('heroTo'))}</span>`,
  }));
  section.append(el('p', { text: t('heroLead') }));

  const ask = el('div', { class: 'dash-hero-ask' });
  const composer = el('div', { class: 'composer' });
  const form = composerForm(ctx, { autofocus: false, labelled: true });
  composer.append(form);
  composer.append(el('p', { class: 'voice-status', role: 'status', 'aria-live': 'polite' }));
  // The same suggest-as-you-type the other composers have, so the front door
  // behaves like the rest of the site.
  attachSuggest(form.querySelector('textarea'), ctx);
  ask.append(composer);

  ask.append(el('ul', {
    class: 'example-prompts',
    html: EXAMPLE_PROMPTS.map((p) => `<li><button type="button" data-example="${esc(p)}">${esc(p)}</button></li>`).join(''),
  }));
  // An example fills the field rather than firing a navigation the reader did
  // not ask for; pressing Ask or Enter is the reader's decision.
  ask.querySelectorAll('[data-example]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = document.getElementById('searchInput');
      if (!field) return;
      field.value = btn.getAttribute('data-example');
      field.dispatchEvent(new Event('input'));
      field.focus();
    });
  });

  // The clock is rendered client-side now, in the reader's own timezone,
  // instead of being frozen at whatever the page was captured.
  ask.append(clockLine());
  // Stop the timer as soon as the reader leaves home (F-17).
  ctx.onCleanup(() => clearInterval(clockLine._timer));
  ask.append(depthControl(ctx));
  ask.append(chipRow(QUICK_CHIPS, { onPick: (value) => ctx.onSubmit(value) }));
  ask.append(el('ul', {
    class: 'trust-strip',
    html: `<li>${esc(t('trust1'))}</li><li>${esc(t('trust2'))}</li><li>${esc(t('trust3'))}</li>`,
  }));
  section.append(ask);
  return section;
}

function clockLine() {
  const wrap = el('div', { class: 'dash-clock-line', id: 'dashClock' });
  const paint = () => {
    const { time, day, zone } = clockParts(new Date());
    wrap.innerHTML = `<span class="hero-clock">${icon('clock')}<strong>${esc(time)}</strong><span>${esc(day)}${zone ? ` · ${esc(zone)}` : ''}</span></span>`;
  };
  paint();
  clearInterval(clockLine._timer);
  clockLine._timer = setInterval(paint, 30000);
  return wrap;
}

/* ----------------------------------------------------------------- actions */

function actions() {
  const items = [
    { href: '#/explore', iconName: 'explore', title: t('explore'), body: t('exploreBlurb') },
    { href: '#/today', iconName: 'today', title: t('today'), body: t('todayBlurb') },
    { href: '#/bookmarks', iconName: 'saved', title: t('saved'), body: t('savedBlurb') },
    { href: 'topics/', iconName: 'topics', title: t('topics'), body: t('topicsBlurb') },
    { href: '#/sources', iconName: 'sources', title: t('sources'), body: t('sourcesBlurb') },
  ];
  const section = el('section', { class: 'dash-actions' });
  for (const item of items) {
    section.append(el('a', {
      class: 'dash-action',
      href: item.href,
      html: `<span class="ic">${icon(item.iconName)}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>`,
    }));
  }
  return section;
}

function nudge(ctx) {
  if (ctx.state.contentLang !== 'en') return el('div');
  const wrap = el('div', { class: 'nudge' });
  wrap.append(el('span', { text: t('readsBetter') }));
  const btn = el('button', { type: 'button', class: 'btn btn-primary', text: t('readInHindi') });
  btn.addEventListener('click', () => {
    ctx.setContentLang('hi');
    wrap.remove();
  });
  wrap.append(btn);
  return wrap;
}

/* --------------------------------------------------------- article of day */

function aotdMount(ctx) {
  const mount = el('div', { id: 'aotdMount' });
  mount.append(skeletonGrid(1, 'card'));
  loadAotd(ctx, mount);
  return mount;
}

/** Pick an article only after finding a picture that belongs to that page.
 * Picture-of-the-day media is deliberately not used as a substitute: it can
 * describe an unrelated subject. A missing featured thumbnail is resolved
 * with PageImages, then the next candidate is tried. */
export async function resolveAotdArticle(ctx, lang, skipTitles = []) {
  const feed = await ctx.api.featured(lang).catch(() => ({ article: null, mostread: [] }));
  const candidates = [];
  const seen = new Set(skipTitles.map((title) => String(title).toLocaleLowerCase()));
  const add = (item) => {
    const title = String(item?.title || '').trim();
    const key = title.toLocaleLowerCase();
    if (title && !seen.has(key)) { seen.add(key); candidates.push(item); }
  };
  add(feed.article);
  for (const item of feed.mostread || []) add(item);

  if (candidates.length < 2) {
    const popular = await ctx.api.mostRead(lang).catch(() => []);
    for (const row of popular || []) add(row);
  }

  for (const candidate of candidates.slice(0, 10)) {
    const title = candidate.title;
    let article = candidate;
    let thumb = candidate.thumb?.src ? candidate.thumb : null;
    if (!thumb && typeof ctx.api.pageImage === 'function') {
      const image = await ctx.api.pageImage(lang, title).catch(() => null);
      if (image?.src) thumb = image;
    }
    if (!article.extract || !article.url || !thumb) {
      const summary = await ctx.api.summary(lang, title).catch(() => null);
      if (summary) {
        article = { ...summary, ...candidate };
        thumb ||= summary.thumb?.src ? summary.thumb : null;
      }
    }
    if (!thumb?.src) continue;
    const url = article.url || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    return { ...article, title: article.title || title, thumb, url };
  }
  return null;
}

async function loadAotd(ctx, mount, skipTitles = []) {
  const lang = ctx.state.contentLang;
  try {
    const article = await resolveAotdArticle(ctx, lang, skipTitles);
    const section = el('section', { class: 'sec' });
    // The snapshot's own wording: "changes daily" rather than a "view all"
    // link. The heading used to be built here and never appended, so the
    // section kept the other label.
    const head = el('div', { class: 'sec-head' });
    head.append(el('h2', { text: t('aotd') }));
    head.append(el('span', { class: 'more', text: t('changesDaily') }));
    section.append(head);

    const wrap = el('div', { class: 'aotd' });
    const figure = el('figure', { class: 'aotd-media' });
    const body = el('div', { class: 'aotd-body' });
    body.append(el('span', { class: 'badge accent', text: t('aotd') }));

    if (!article) {
      figure.append(el('img', {
        src: '/assets/img/image-fallback.svg', alt: '', loading: 'eager',
        decoding: 'async', width: 1200, height: 750,
      }));
      body.append(el('h2', { text: 'A picture-backed article could not be loaded today' }));
      body.append(el('p', { text: 'Wikipedia did not return an article with a usable image. Please try again; the section stays visible instead of disappearing.' }));
      const retry = el('button', { class: 'btn btn-primary', type: 'button', text: 'Try again' });
      retry.addEventListener('click', () => {
        mount.innerHTML = '';
        mount.append(skeletonGrid(1, 'card'));
        loadAotd(ctx, mount);
      });
      body.append(retry);
    } else {
      const photo = el('img', {
        src: cleanUrl(article.thumb.src), alt: article.title, loading: 'eager',
        fetchpriority: 'high', decoding: 'async', width: 1200, height: 750,
      });
      photo.addEventListener('error', () => {
        if (photo.dataset.retryStarted === 'true') return;
        photo.dataset.retryStarted = 'true';
        // An HTTP-successful API response can still point at a blocked or
        // missing file. Try another article rather than leaving a broken image.
        loadAotd(ctx, mount, [...skipTitles, article.title]);
      });
      figure.append(photo);
      body.append(el('h2', { text: article.title }));
      if (article.description) body.append(el('p', { html: `<em>${esc(article.description)}</em>` }));
      body.append(el('p', { text: clamp(article.extract, 220) }));
      body.append(rowCta({ title: article.title, lang, wikiUrl: article.url }));
      body.append(el('p', { class: 'src-credit', text: `${t('fromWikipedia')} ${lang}.wikipedia.org` }));
    }
    wrap.append(figure, body);
    section.append(wrap);

    mount.innerHTML = '';
    mount.append(section);
  } catch {
    // Keep the section visible and say what happened; do not silently erase it.
    mount.innerHTML = '';
    const section = el('section', { class: 'sec' });
    const head = el('div', { class: 'sec-head' });
    head.append(el('h2', { text: t('aotd') }));
    section.append(head);
    const wrap = el('div', { class: 'aotd' });
    wrap.append(el('figure', { class: 'aotd-media' }, [el('img', {
      src: '/assets/img/image-fallback.svg', alt: '', width: 1200, height: 750, decoding: 'async',
    })]));
    const body = el('div', { class: 'aotd-body' });
    body.append(el('h2', { text: 'Today’s featured article is temporarily unavailable' }));
    body.append(el('p', { text: 'The article feed could not be reached. Please reload this section in a moment.' }));
    wrap.append(body);
    section.append(wrap);
    mount.append(section);
  }
}

/* ------------------------------------------------------ popular questions */

function questionsMount(ctx) {
  const mount = el('div', { id: 'dashQuestions' });
  mount.append(skeletonGrid(4, 'q'));
  loadQuestions(ctx, mount);
  return mount;
}

async function loadQuestions(ctx, mount) {
  try {
    const lang = ctx.state.contentLang;
    const found = await ctx.api.summaries(lang, POPULAR.map((p) => p.title));
    const section = el('section');
    section.append(bandHead({
      title: t('popularQuestions'), iconName: 'ask', blurb: t('popularBlurb'),
      more: 'questions/', moreLabel: t('viewAll'),
    }));
    const grid = el('div', { class: 'q-grid' });
    for (const item of POPULAR) {
      const page = found.get(item.title) || {};
      grid.append(qCard({
        question: item.question,
        extract: page.extract || '',
        thumb: page.thumb?.src || '',
        tag: item.tag,
        sourceTitle: item.title,
      }));
    }
    section.append(grid);
    mount.innerHTML = '';
    mount.append(section);
  } catch {
    mount.innerHTML = '';
  }
}

/* ------------------------------------------------------------- categories */

function categories() {
  const section = el('section');
  section.append(bandHead({ title: t('exploreByCategory'), iconName: 'topics', more: 'topics/' }));
  const grid = el('div', { class: 'cat-grid' });
  for (const cat of CATEGORIES) grid.append(catCard(cat));
  section.append(grid);
  return section;
}

/* ----------------------------------------------------------- how it works */

function howItWorks() {
  const section = el('section');
  const head = bandHead({ title: t('howItWorks'), iconName: 'plus', more: 'how-it-works/', moreLabel: t('inDetail') });
  section.append(head);
  const steps = [
    { title: t('howAsk'), body: t('howAskBody') },
    { title: t('howResearch'), body: t('howResearchBody') },
    { title: t('howFilter'), body: t('howFilterBody') },
    { title: t('howUnderstand'), body: t('howUnderstandBody') },
  ];
  const grid = el('div', { class: 'howsteps' });
  for (const step of steps) {
    grid.append(el('article', {
      class: 'howstep',
      html: `<h3>${esc(step.title)}</h3><p>${esc(step.body)}</p>`,
    }));
  }
  section.append(grid);
  return section;
}

/* --------------------------------------------------------------- trending */

function trendingMount(ctx) {
  const mount = el('div', { id: 'trendingMount' });
  mount.append(skeletonGrid(6, 'card'));
  loadTrending(ctx, mount);
  return mount;
}

async function loadTrending(ctx, mount) {
  try {
    const lang = ctx.state.contentLang;
    const rows = await ctx.api.mostRead(lang);
    if (!rows.length) {
      mount.innerHTML = '';
      return;
    }
    const section = el('section', { class: 'sec' });
    const head = el('div', { class: 'sec-head' });
    head.append(el('h2', { text: t('mostRead') }));
    head.append(el('span', { class: 'more', text: t('mostViewedToday') }));
    section.append(head);

    const found = await ctx.api.summaries(lang, rows.slice(0, 8).map((r) => r.title));
    const grid = el('div', { class: 'grid' });
    for (const row of rows.slice(0, 8)) {
      const page = found.get(row.title) || { title: row.title, extract: '' };
      grid.append(card({ ...page, title: row.title }, { lang }));
    }
    section.append(grid);
    mount.innerHTML = '';
    mount.append(section);
  } catch {
    mount.innerHTML = '';
  }
}

/* --------------------------------------------------------------- ask band */

function askBand(ctx) {
  const section = el('section', { class: 'sec' });
  section.append(sectionHead({ title: t('askQuestion') }));
  section.append(el('p', { style: 'color:var(--muted);margin:-8px 0 16px', text: t('askQuestionBlurb') }));
  section.append(chipRow(ASK_CHIPS, { justify: true, onPick: (value) => ctx.onSubmit(value, 'ask') }));
  return section;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
