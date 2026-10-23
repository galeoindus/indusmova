/* indusmova — the Ask view.
 *
 * A question goes in; a source-backed answer comes out, laid out in the app's
 * own architecture rather than as a Wikipedia page:
 *
 *   .evidence     how the answer was ranked, and from how much
 *   .qa-answer    the sentences that answer it (.line-list)
 *   .answer-card  the key points
 *   .topic-block  the article broken up topic by topic, numbered, short by
 *                 default with a control that extends each one
 *   .factbox      the infobox, as label/value rows
 *   .src-group    the sources, as cards, with licences
 *   .method-note  exactly how the answer was produced
 *   .fb-*         emoji feedback
 *
 * Changing the answer depth or the meaning switch re-composes the answer in
 * place — the options act the moment they are clicked, with no second submit.
 */

import { el, clamp } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { clean } from '../parse.js';
import { composeAnswer } from '../answer.js';
import { answerToMarkdown, download } from '../markdown.js';
import {
  evidenceStrip, topicBlocks, methodNote, factsBox, sourcesGroup,
  scopeNote, feedback, curatedNote, markdownActions, railActions, selectedNote,
} from '../answerui.js';
import { sectionHead, card, errorBox, emptyState, toast } from '../components.js';
import { mountOpenSources } from './library.js';
import { composerForm, depthControl, attachSuggest } from '../composer.js';
import { articleHref, searchHref } from '../router.js';
import { jumper } from './article.js';

export async function renderAsk(ctx, route) {
  const wrap = el('div', { class: 'wrap-narrow' });
  const question = (route.query.q || route.params.title || '').replace(/_/g, ' ').trim();

  wrap.append(el('span', { class: 'kicker', text: t('heroBadge') }));
  wrap.append(askHead(ctx, question));
  wrap.append(composerBlock(ctx, question));

  if (!question) {
    wrap.append(emptyState({
      iconName: 'ask', title: t('askQuestion'), body: t('askQuestionBlurb'),
      cta: t('explore'), ctaHref: '#/explore',
    }));
    return wrap;
  }

  const mount = el('div', { class: 'qa qa-wide' });
  wrap.append(mount);
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${esc(t('loading'))}</p>` }));

  const state = {
    question,
    lang: route.query?.lang || ctx.state.contentLang,
    data: null,
    root: null,
    answer: null,
  };

  // The depth and meaning controls call this, so the open answer updates at once.
  ctx.optionsChanged = () => { if (state.data) paint(ctx, mount, state); };
  ctx.onCleanup(() => { ctx.optionsChanged = () => {}; });

  load(ctx, mount, state);
  return wrap;
}

function askHead(ctx, question) {
  const head = el('div', { class: 'ask-head' });
  const qa = el('div', { class: 'qa-q' });
  qa.append(el('span', { class: 'qa-label', text: t('ask') }));
  qa.append(el('h1', { class: 'qa-question', text: question || t('askQuestion') }));
  const alt = el('p', { class: 'qa-alt' });
  alt.append(el('a', { href: searchHref(question, { lang: ctx.state.contentLang }), text: `${t('searchMode')}: ${question}` }));
  qa.append(alt);
  head.append(qa);
  return head;
}

function composerBlock(ctx, question) {
  const composer = el('div', { class: 'composer', style: 'margin:0 0 22px' });
  const form = composerForm(ctx, { placeholderKey: 'askPlaceholder', autofocus: !question, initialMode: 'ask', labelled: true });
  composer.append(form);
  composer.append(el('p', { class: 'voice-status', id: 'voiceStatus', role: 'status', 'aria-live': 'polite' }));
  attachSuggest(form.querySelector('textarea'), ctx);
  if (question) form.querySelector('textarea').value = question;
  composer.append(depthControl(ctx));
  return composer;
}

/* ------------------------------------------------------------------ load */

async function load(ctx, mount, state, retry = 0) {
  try {
    const title = await ctx.api.resolveTitle(state.lang, state.question);
    if (!title) {
      mount.innerHTML = '';
      mount.append(emptyState({
        iconName: 'search', title: t('noResults'), body: t('askQuestionBlurb'),
        cta: t('searchMode'), ctaHref: searchHref(state.question, { lang: state.lang }),
      }));
      return;
    }
    state.data = await ctx.api.article(state.lang, title);
    state.title = state.data.title;
    state.wikiUrl = `https://${state.lang}.wikipedia.org/wiki/${encodeURIComponent(state.data.title.replace(/ /g, '_'))}`;
    state.root = clean(state.data.html);
    paint(ctx, mount, state);
    ctx.pushHistory({
      id: `ask:${state.lang}:${state.data.title}`, kind: 'ask',
      title: state.data.title, question: state.question, lang: state.lang,
      url: articleHref(state.data.title, state.lang),
    });
  } catch (err) {
    mount.innerHTML = '';
    const message = err?.status === 404 ? t('notFoundBody') : err?.message;
    mount.append(errorBox(message, { onRetry: () => load(ctx, mount, state, retry + 1), query: state.question, searchHref: searchHref(state.question) }));
    if (err?.name === 'ApiError' && err.status !== 404 && retry === 0) {
      setTimeout(() => load(ctx, mount, state, 1), 600);
    }
  }
}

/* ---------------------------------------------------------------- paint */

async function paint(ctx, mount, state) {
  mount.innerHTML = '';
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${esc(t('loading'))}</p>` }));

  let answer;
  try {
    answer = await composeAnswer({
      question: state.question,
      root: state.root,
      sections: state.data.sections,
      depth: ctx.state.depth,
      deep: ctx.state.deepRank,
      lang: state.lang,
      title: state.data.title,
      mode: 'ask',
    });
  } catch (err) {
    mount.innerHTML = '';
    mount.append(errorBox(err, { query: state.question, searchHref: searchHref(state.question) }));
    return;
  }
  answer.wikiUrl = state.wikiUrl;
  answer.revid = state.data.revid;
  state.answer = answer;

  mount.innerHTML = '';

  // Contents and actions live in the rail beside the answer; the answer itself
  // is the reading column. Same shape as the article view, because the reader
  // asked for one architecture across the whole site.
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1040px)').matches;
  const grid = el('div', { class: `article-grid${wide ? ' rail-open' : ''}` });
  const content = el('div', { class: 'panel' });
  const rail = el('aside', { class: 'toc-rail', 'aria-label': t('jumpToSection') });
  rail.append(jumper(state, answer));
  rail.append(railActions(articleActions(ctx, answer)));
  grid.append(content, rail);
  mount.append(grid);

  content.append(evidenceStrip({
    matched: answer.rankedCount,
    considered: answer.method.sentencesConsidered,
    sections: answer.method.sectionsRead,
    title: answer.title,
    deep: ctx.state.deepRank,
  }));

  // The direct answer, kept short: the depth presets cap it at three to
  // sixteen sentences, so the breakdown stays a summary rather than a dump.
  const qaAnswer = el('div', { class: 'qa-answer' });
  qaAnswer.append(el('h2', { text: t('coreAnswer') }));
  qaAnswer.append(selectedNote(answer.title, state.lang, answer.wikiUrl));
  if (answer.core.length) {
    const list = el('ul', { class: 'line-list' });
    answer.core.forEach((sentence) => list.append(el('li', { text: sentence })));
    qaAnswer.append(list);
  } else {
    qaAnswer.append(el('p', { class: 'prose', text: clamp(answer.leadText, 400) }));
  }
  content.append(qaAnswer);

  // Key points.
  if (answer.keyPoints.length > 1) {
    const card = el('div', { class: 'answer-card' });
    card.append(el('h2', { text: t('keyPoints') }));
    const ol = el('ol', { class: 'points-list' });
    answer.keyPoints.forEach((point) => {
      const li = el('li');
      li.append(el('span', { class: 'point-text', text: point.text }));
      if (point.section) li.append(el('span', { class: 'point-from', text: `— ${point.section}` }));
      ol.append(li);
    });
    card.append(ol);
    content.append(card);
  }

  // The topic-wise breakdown: short by default, extended at deep-dive depth.
  if (answer.topics.length) {
    content.append(sectionHead({ title: t('inDepth') }));
    content.append(topicBlocks(answer.topics, { open: ctx.state.depth === 'deep' }));
    content.append(curatedNote(t('depthFootnote', {
      shown: answer.method.topicsShown,
      total: answer.method.sectionsRead,
      depth: t(answer.method.depth === 'quick' ? 'quickAnswer' : answer.method.depth === 'deep' ? 'deepDive' : 'detailed'),
    })));
  }

  // Facts.
  const facts = factsBox(answer.facts, answer.title);
  if (facts) content.append(facts);

  // How it was made, and what it does not claim. The numbered Wikipedia
  // reference list is deliberately not repeated here — it belongs to the full
  // article, not to the breakdown.
  content.append(methodNote(answer.method, { revid: answer.revid, lang: state.lang, title: answer.title, wikiUrl: answer.wikiUrl }));
  content.append(scopeNote(t('scopeAnswer')));
  content.append(feedback(ctx, `ask:${state.lang}:${answer.title}`));

  loadRelated(ctx, mount, { title: answer.title, lang: state.lang });
}

/* -------------------------------------------------------------- actions */

function articleActions(ctx, answer) {
  const actions = el('div', { class: 'article-actions' });
  const id = `ask:${answer.lang}:${answer.title}`;

  const saveBtn = el('button', {
    type: 'button', class: `btn btn-ghost${ctx.isBookmarked(id) ? ' is-on' : ''}`,
    html: `${icon('bookmark')}<span>${esc(ctx.isBookmarked(id) ? t('savedOnDevice') : t('bookmarks'))}</span>`,
  });
  saveBtn.addEventListener('click', () => {
    const saved = ctx.toggleBookmark({
      id, title: answer.title, question: answer.question, lang: answer.lang,
      url: articleHref(answer.title, answer.lang), extract: clamp(answer.leadText, 160),
    });
    saveBtn.innerHTML = `${icon('bookmark')}<span>${esc(saved ? t('saved') : t('bookmarks'))}</span>`;
    saveBtn.classList.toggle('is-on', saved);
    toast(saved ? t('savedOnDevice') : t('removedFromSaved'));
  });
  actions.append(saveBtn);

  actions.append(markdownActions({
    getText: () => answerToMarkdown(answer, { url: answer.wikiUrl }),
    filename: answer.title,
  }));

  const shareBtn = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('share')}<span>${esc(t('share'))}</span>` });
  shareBtn.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#/article/${encodeURIComponent(answer.title.replace(/ /g, '_'))}`;
    if (navigator.share) { try { await navigator.share({ title: answer.title, url }); } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { /* ignore */ } }
  });
  actions.append(shareBtn);

  actions.append(el('a', {
    class: 'btn btn-ghost', href: articleHref(answer.title, answer.lang),
    html: `${icon('book')}<span>${esc(t('readArticle'))}</span>`,
  }));
  return actions;
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
  } catch { /* related is a bonus */ }
  mountOpenSources(ctx, mount, title);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
