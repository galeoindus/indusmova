/* indusmova — the Ask view.
 *
 * A question goes in; a source-backed answer comes out. The shape is the one
 * the stylesheet already describes:
 *
 *   .qa-q        the question, restated
 *   .qa-answer   the sentences that answer it (.line-list)
 *   .evidence    how the answer was assembled, and from how many sources
 *   .points-list the strongest supporting sentences, with their section
 *   .topic-block the article broken up topic by topic
 *   .factbox     the infobox, as label/value rows
 *   .src-group   the sources, with links
 *
 * Nothing is generated: every sentence is quoted from the article, and ranking
 * only decides the order.
 */

import { el, clamp, cleanUrl } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { clean } from '../parse.js';
import { composeAnswer } from '../answer.js';
import { answerToMarkdown, download } from '../markdown.js';
import { sectionHead, card, errorBox, emptyState, toast, rowCta } from '../components.js';
import { composerForm, depthControl, attachSuggest } from '../composer.js';
import { articleHref, searchHref } from '../router.js';

export async function renderAsk(ctx, route) {
  const wrap = el('div', { class: 'wrap-narrow' });
  const question = (route.query.q || route.params.title || '').replace(/_/g, ' ').trim();

  wrap.append(kicker());
  wrap.append(askHead(question));
  wrap.append(composerBlock(ctx, question));

  if (!question) {
    wrap.append(emptyState({
      iconName: 'ask', title: t('askQuestion'), body: t('askQuestionBlurb'),
      cta: t('explore'), ctaHref: '#/explore',
    }));
    return wrap;
  }

  const mount = el('div', { class: 'qa' });
  wrap.append(mount);
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${t('loading')}</p>` }));
  build(ctx, mount, question);
  return wrap;
}

function kicker() {
  return el('span', { class: 'kicker', text: t('heroBadge') });
}

function askHead(question) {
  const head = el('div', { class: 'ask-head' });
  const qa = el('div', { class: 'qa-q' });
  qa.append(el('span', { class: 'qa-label', text: t('ask') }));
  qa.append(el('h1', { class: 'qa-question', text: question || t('askQuestion') }));
  head.append(qa);
  return head;
}

function composerBlock(ctx, question) {
  const composer = el('div', { class: 'composer', style: 'margin:0 0 22px' });
  const form = composerForm(ctx, { placeholderKey: 'askPlaceholder', autofocus: !question });
  composer.append(form);
  composer.append(el('p', { class: 'voice-status', id: 'voiceStatus', role: 'status', 'aria-live': 'polite' }));
  attachSuggest(form.querySelector('textarea'), ctx);
  if (question) form.querySelector('textarea').value = question;
  composer.append(depthControl(ctx));
  return composer;
}

/* ------------------------------------------------------------------ build */

async function build(ctx, mount, question, retry = 0) {
  const lang = routeLang(ctx);
  const deep = ctx.state.deepRank;
  try {
    if (deep) {
      const note = el('p', { class: 'ask-note', text: t('deepLoading') });
      mount.querySelector('.state')?.replaceWith(note);
    }
    const title = await ctx.api.resolveTitle(lang, question);
    if (!title) {
      mount.innerHTML = '';
      mount.append(emptyState({ iconName: 'search', title: t('noResults'), body: t('askQuestionBlurb'), cta: t('searchMode'), ctaHref: searchHref(question, { lang }) }));
      return;
    }
    const data = await ctx.api.article(lang, title);
    const root = clean(data.html);
    const answer = await composeAnswer({
      question, root, sections: data.sections, depth: ctx.state.depth, deep, lang, title: data.title,
    });
    answer.revid = data.revid;
    answer.wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

    renderAnswer(ctx, mount, answer);
    ctx.pushHistory({
      id: `ask:${lang}:${title}`,
      kind: 'ask',
      title,
      question,
      lang,
      url: articleHref(title, lang),
    });
  } catch (err) {
    mount.innerHTML = '';
    const message = err?.status === 404 ? t('notFoundBody') : err?.message;
    mount.append(errorBox(message, { onRetry: () => build(ctx, mount, question, retry + 1) }));
    if (err?.name === 'ApiError' && err.status !== 404) {
      // One silent retry: Wikimedia occasionally drops a first request.
      if (retry === 0) setTimeout(() => build(ctx, mount, question, 1), 600);
    }
  }
}

function routeLang(ctx) {
  const route = ctx.route || {};
  return route.query?.lang || ctx.state.contentLang;
}

/* ----------------------------------------------------------------- render */

function renderAnswer(ctx, mount, answer) {
  mount.innerHTML = '';
  const lang = answer.lang;

  // How the answer was built — transparent, not a black box.
  mount.append(evidenceStrip(answer, ctx));

  // The direct answer.
  const qaAnswer = el('div', { class: 'qa-answer' });
  qaAnswer.append(el('h2', { text: t('answer') }));
  if (answer.core.length) {
    const list = el('ul', { class: 'line-list' });
    answer.core.forEach((sentence) => list.append(el('li', { text: sentence })));
    qaAnswer.append(list);
  } else {
    qaAnswer.append(el('p', { class: 'prose', text: clamp(answer.leadText, 400) }));
  }
  mount.append(qaAnswer);

  // The source line under the answer.
  const srcLine = el('p', { class: 'point-from-static' });
  srcLine.append(el('a', {
    href: answer.wikiUrl, target: '_blank', rel: 'noopener noreferrer',
    text: `${lang}.wikipedia.org › ${answer.title}`,
  }));
  mount.append(srcLine);

  mount.append(articleActions(ctx, answer));

  // Key points.
  if (answer.keyPoints.length > 1) {
    const card = el('div', { class: 'answer-card' });
    card.append(el('h2', { text: t('keyPoints') }));
    const ol = el('ol', { class: 'points-list' });
    answer.keyPoints.forEach((point) => {
      const li = el('li');
      li.append(el('span', { class: 'point-text', text: point.text }));
      if (point.section) {
        li.append(el('span', { class: 'point-from', text: `— ${point.section}` }));
      }
      ol.append(li);
    });
    card.append(ol);
    mount.append(card);
  }

  // Topic-wise breakdown.
  if (answer.topics.length) {
    const head = sectionHead({ title: t('inDepth') });
    mount.append(head);
    for (const topic of answer.topics) {
      const block = el('div', { class: 'topic-block' });
      block.append(el('h3', { text: topic.title }));
      const list = el('ul', { class: 'line-list' });
      topic.points.forEach((p) => list.append(el('li', { text: p })));
      block.append(list);
      mount.append(block);
    }
  }

  // Facts from the infobox.
  if (answer.facts.length) {
    const box = el('div', { class: 'factbox' });
    box.append(el('h3', { html: `${esc(t('facts'))}<span class="factbox-src">${esc(answer.title)}</span>` }));
    const dl = el('dl');
    for (const fact of answer.facts) {
      const row = el('div', { class: 'row' });
      row.append(el('dt', { text: fact.label }));
      row.append(el('dd', { text: fact.value }));
      dl.append(row);
    }
    box.append(dl);
    mount.append(box);
  }

  // Sources.
  mount.append(sourcesGroup(answer));

  // Related reading.
  loadRelated(ctx, mount, answer);
}

function evidenceStrip(answer, ctx) {
  const strip = el('div', { class: `evidence ${answer.core.length ? 'is-ok' : 'is-warn'}` });
  const head = el('p', { class: 'evidence-head' });
  head.append(el('span', {
    class: 'evidence-label',
    text: answer.core.length
      ? (ctx.state.deepRank ? 'Ranked by meaning' : 'Ranked by relevance')
      : 'Limited match',
  }));
  head.append(el('span', { class: 'evidence-note', text: `${answer.rankedCount} sentences matched the question across ${answer.topics.length} sections of “${answer.title}”.` }));
  strip.append(head);
  strip.append(el('p', {
    class: 'evidence-explainer',
    text: 'Sentences are quoted from the article; indusmova orders them by how well they answer your question. No text is generated.',
  }));
  return strip;
}

function articleActions(ctx, answer) {
  const actions = el('div', { class: 'article-actions' });
  const id = `ask:${answer.lang}:${answer.title}`;

  const saveBtn = el('button', {
    type: 'button',
    class: `btn btn-ghost${ctx.isBookmarked(id) ? ' is-on' : ''}`,
    html: `${icon('bookmark')}${esc(ctx.isBookmarked(id) ? t('saved') : t('bookmarks'))}`,
  });
  saveBtn.addEventListener('click', () => {
    const saved = ctx.toggleBookmark({
      id, title: answer.title, question: answer.question, lang: answer.lang,
      url: articleHref(answer.title, answer.lang), extract: clamp(answer.leadText, 160),
    });
    saveBtn.innerHTML = `${icon('bookmark')}${esc(saved ? t('saved') : t('bookmarks'))}`;
    saveBtn.classList.toggle('is-on', saved);
    toast(saved ? t('saved') : t('remove'));
  });
  actions.append(saveBtn);

  const copyBtn = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('copy')}${esc(t('copyMarkdown'))}` });
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(answerToMarkdown(answer, { url: answer.wikiUrl }));
      toast(t('copied'));
    } catch {
      toast(t('errorBody'));
    }
  });
  actions.append(copyBtn);

  const dlBtn = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('download')}${esc(t('downloadMarkdown'))}` });
  dlBtn.addEventListener('click', () => download(`${answer.title.replace(/[^\w\s-]/g, '')}.md`, answerToMarkdown(answer, { url: answer.wikiUrl })));
  actions.append(dlBtn);

  const shareBtn = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('share')}${esc(t('share'))}` });
  shareBtn.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#/article/${encodeURIComponent(answer.title.replace(/ /g, '_'))}`;
    if (navigator.share) {
      try { await navigator.share({ title: answer.title, url }); } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { /* ignore */ }
    }
  });
  actions.append(shareBtn);

  actions.append(el('a', {
    class: 'btn btn-ghost', href: articleHref(answer.title, answer.lang), html: `${icon('book')}${esc(t('readArticle'))}`,
  }));
  return actions;
}

function sourcesGroup(answer) {
  const group = el('div', { class: 'src-group' });
  group.append(el('h3', { text: t('sourcesHeading') }));
  const list = el('ul', { class: 'line-list' });
  const items = [
    { label: `Wikipedia · ${answer.lang}.wikipedia.org`, url: answer.wikiUrl },
    { label: 'Wikidata · wikidata.org', url: 'https://www.wikidata.org/' },
    { label: 'Wikimedia Commons · commons.wikimedia.org', url: 'https://commons.wikimedia.org/' },
  ];
  for (const item of items) {
    const li = el('li');
    li.append(el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', text: item.label }));
    list.append(li);
  }
  group.append(list);
  group.append(el('p', {
    class: 'src-credit',
    text: `${t('attribution')}`,
  }));
  if (answer.citations.length) {
    const details = el('details', { class: 'src-records' });
    details.append(el('summary', { text: `${t('citations')} (${answer.citations.length})` }));
    const ol = el('ol', { class: 'line-list' });
    answer.citations.slice(0, 12).forEach((c) => ol.append(el('li', { text: clamp(c, 220) })));
    details.append(ol);
    group.append(details);
  }
  return group;
}

async function loadRelated(ctx, mount, answer) {
  try {
    const related = await ctx.api.related(answer.lang, answer.title);
    if (!related.length) return;
    const section = el('section', { class: 'sec' });
    section.append(sectionHead({ title: t('related'), more: searchHref(answer.title, { lang: answer.lang }) }));
    const grid = el('div', { class: 'grid' });
    related.slice(0, 6).forEach((page) => grid.append(card(page, { lang: answer.lang })));
    section.append(grid);
    mount.append(section);
  } catch { /* related is a bonus */ }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
