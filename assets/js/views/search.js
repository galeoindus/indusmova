/* indusmova — search results.
 *
 * The Search mode of the composer lands here. It shows the composer again at
 * the top (so refining is one keystroke away), then the matching articles.
 *
 * A result is a row, not a card in a four-column grid. The grid put the title,
 * the picture and a hundred characters of text inside a box about a thumb
 * wide, so a query with eighteen matches read as eighteen thin strips with
 * nothing in them. A row gives the title room to be a title, the snippet room
 * to be read (72 characters a line, the same measure as the article), and the
 * picture a fixed 84px square so the rows line up down the page.
 *
 * Above the rows sits one offer: the same query as an answer rather than a
 * list, because half the people who type a question here wanted an answer.
 */

import { el, clamp, cleanUrl } from '../ui.js';
import { icon, PLACEHOLDER_MARK } from '../icons.js';
import { t } from '../i18n.js';
import { emptyState, errorBox } from '../components.js';
import { composerForm, attachSuggest } from '../composer.js';
import { searchHref, articleHref } from '../router.js';

export async function renderSearch(ctx, route) {
  const wrap = el('div', { class: 'wrap sresults' });
  const query = (route.query.q || '').trim();

  // The box. On this page it searches: the mode is set here so what the
  // buttons show and what a submit does cannot disagree.
  ctx.setMode('search');
  const bar = el('section', { class: 'sbar' });
  const composer = el('div', { class: 'composer' });
  const form = composerForm(ctx, {
    placeholderKey: 'askPlaceholder',
    autofocus: !query,
    labelled: true,
    initialMode: 'search',
    onSubmit: (value) => {
      // If the reader switched the form to Ask, send them to Ask. Otherwise
      // this page searches, whatever mode they used last elsewhere.
      const mode = ctx.state.mode === 'ask' ? 'ask' : 'search';
      ctx.navigate(`/${mode}?q=${encodeURIComponent(value)}`);
    },
  });
  composer.append(form);
  composer.append(el('p', { class: 'voice-status', role: 'status', 'aria-live': 'polite' }));
  attachSuggest(form.querySelector('textarea'), ctx);
  if (query) form.querySelector('textarea').value = query;
  bar.append(composer);
  wrap.append(bar);

  const head = el('div', { class: 'sres-head' });
  const title = el('div');
  title.append(el('h1', { text: query || t('searchResults') }));
  if (query) {
    title.append(el('p', {
      class: 'sres-sub',
      html: `${esc(t('searchResults'))} · <span class="mono">${esc(ctx.state.contentLang)}.wikipedia.org</span>`,
    }));
  }
  head.append(title);
  wrap.append(head);

  const results = el('div', { id: 'searchResults', class: 'sres-body' });
  wrap.append(results);

  if (!query) {
    results.append(emptyState({
      iconName: 'search', title: t('searchResults'), body: t('askQuestionBlurb'),
      cta: t('explore'), ctaHref: '#/explore',
    }));
    return wrap;
  }

  results.append(skeletonRows(5));
  runSearch(ctx, results, query);
  return wrap;
}

async function runSearch(ctx, mount, query) {
  const lang = ctx.state.contentLang;
  try {
    const hits = await ctx.api.search(lang, query, { limit: 18 });
    if (!hits.length) {
      mount.innerHTML = '';
      mount.append(emptyState({
        iconName: 'search', title: t('noResults'), body: t('askQuestionBlurb'),
        cta: t('askMode'), ctaHref: searchHref(query, { mode: 'ask', lang }),
      }));
      return;
    }
    const found = await ctx.api.summaries(lang, hits.map((h) => h.title));

    mount.innerHTML = '';
    mount.append(askOffer(query, lang));

    const list = el('div', { class: 'sres-list', role: 'list' });
    const count = el('p', {
      class: 'sres-count',
      text: t('resultsCount', { count: String(hits.length) }),
    });
    mount.append(count);
    hits.forEach((hit, i) => {
      list.append(resultRow(hit, found.get(hit.title) || {}, lang, i + 1));
    });
    mount.append(list);
  } catch (err) {
    mount.innerHTML = '';
    mount.append(errorBox(err, { onRetry: () => runSearch(ctx, mount, query), query }));
  }
}

/** One result: picture, source line, title, snippet. */
function resultRow(hit, page, lang, rank) {
  const row = el('a', { class: 'sres-row', href: articleHref(hit.title, lang), role: 'listitem' });

  const thumb = el('span', { class: 'sres-thumb' });
  if (page.thumb?.src) {
    thumb.append(el('img', {
      src: cleanUrl(page.thumb.src), alt: '', loading: rank > 2 ? 'lazy' : 'eager', decoding: 'async',
    }));
  } else {
    thumb.classList.add('placeholder');
    thumb.setAttribute('aria-hidden', 'true');
    thumb.innerHTML = PLACEHOLDER_MARK;
  }
  row.append(thumb);

  const body = el('span', { class: 'sres-text' });
  body.append(el('span', {
    class: 'sres-src',
    html: `<span class="sres-dot" aria-hidden="true"></span>${esc(lang)}.wikipedia.org › ${esc(hit.title)}`,
  }));
  body.append(el('span', { class: 'sres-title', text: hit.title }));
  const blurb = page.extract || page.description || '';
  if (blurb) body.append(el('span', { class: 'sres-snippet', text: clamp(blurb, 300) }));
  row.append(body);

  return row;
}

/** "Ask this instead" — the same query, answered rather than listed. */
function askOffer(query, lang) {
  const box = el('a', { class: 'sres-ask', href: searchHref(query, { mode: 'ask', lang }) });
  box.append(el('span', { class: 'sres-ask-ic', html: icon('sparkle') }));
  const text = el('span', { class: 'sres-ask-text' });
  text.append(el('strong', { text: t('askInsteadTitle') }));
  text.append(el('span', { text: t('askInsteadBody') }));
  box.append(text);
  box.append(el('span', { class: 'sres-ask-go', html: `${esc(t('askAboutIt'))} →` }));
  return box;
}

/** Five grey rows while the query is out. */
function skeletonRows(count = 5) {
  const wrap = el('div', { class: 'sres-list', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    wrap.append(el('div', {
      class: 'sres-row is-skeleton',
      html: `<span class="sres-thumb placeholder"></span>
             <span class="sres-text">
               <span class="sk-line sk-40"></span>
               <span class="sk-line sk-80"></span>
               <span class="sk-line sk-90"></span>
               <span class="sk-line sk-60"></span>
             </span>`,
    }));
  }
  return wrap;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
