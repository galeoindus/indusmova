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
import { SITE, CATEGORIES, QUICK_CHIPS, EXAMPLE_PROMPTS, ASK_CHIPS } from '../config.js';
import { sectionHead, bandHead, card, qCard, catCard, skeletonGrid, errorBox, rowCta } from '../components.js';
import { composerForm, depthControl, chipRow } from '../composer.js';
import { articleHref, searchHref } from '../router.js';

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
    html: `${icon('plus')}${esc(t('heroBadge'))}`,
  }));
  section.append(el('h1', {
    html: `<span>${esc(t('heroFrom'))}</span> <span class="dash-grad">${esc(t('heroTo'))}</span>`,
  }));
  section.append(el('p', { text: t('heroLead') }));

  const ask = el('div', { class: 'dash-hero-ask' });
  const composer = el('div', { class: 'composer' });
  composer.append(composerForm(ctx, { autofocus: false }));
  composer.append(el('p', { class: 'voice-status', id: 'voiceStatus', role: 'status', 'aria-live': 'polite' }));
  ask.append(composer);

  ask.append(el('ul', {
    class: 'example-prompts',
    html: EXAMPLE_PROMPTS.map((p) => `<li><button type="button" data-example="${esc(p)}">${esc(p)}</button></li>`).join(''),
  }));
  ask.querySelectorAll('[data-example]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.onSubmit(btn.getAttribute('data-example')));
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

async function loadAotd(ctx, mount) {
  try {
    const lang = ctx.state.contentLang;
    const featured = await ctx.api.featured(lang);
    let article = featured.article;
    if (!article) {
      const rows = await ctx.api.mostRead(lang);
      if (rows.length) article = await ctx.api.summary(lang, rows[0].title);
    }
    if (!article) {
      mount.innerHTML = '';
      return;
    }
    const section = el('section', { class: 'sec' });
    section.append(sectionHead({ title: t('aotd'), more: articleHref(article.title, lang), moreLabel: t('readArticle') })
      || el('div'));
    // Replace the "view all" wording with the snapshot's "changes daily".
    const head = el('div', { class: 'sec-head' });
    head.append(el('h2', { text: t('aotd') }));
    head.append(el('span', { class: 'more', text: t('changesDaily') }));

    const wrap = el('div', { class: 'aotd' });
    const figure = el('figure', { class: 'aotd-media' });
    if (article.thumb?.src) {
      figure.append(el('img', {
        src: cleanUrl(article.thumb.src), alt: article.title, loading: 'eager',
        fetchpriority: 'high', decoding: 'async', width: 1200, height: 750,
      }));
    }
    wrap.append(figure);

    const body = el('div', { class: 'aotd-body' });
    body.append(el('span', { class: 'badge accent', text: t('aotd') }));
    body.append(el('h2', { text: article.title }));
    if (article.description) body.append(el('p', { html: `<em>${esc(article.description)}</em>` }));
    body.append(el('p', { text: clamp(article.extract, 220) }));
    body.append(rowCta({ title: article.title, lang, wikiUrl: article.url }));
    body.append(el('p', { class: 'src-credit', text: `${t('fromWikipedia')} ${lang}.wikipedia.org` }));
    wrap.append(body);
    section.append(wrap);

    mount.innerHTML = '';
    mount.append(section);
  } catch {
    mount.innerHTML = '';
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
