/* indusmova — search results.
 *
 * The Search mode of the composer lands here. It shows the composer again at
 * the top (so refining is one keystroke away), then the matching articles as
 * cards, then a "did you mean to ask?" nudge that re-runs the same query in Ask
 * mode.
 */

import { el, clamp } from '../ui.js';
import { t } from '../i18n.js';
import { card, skeletonGrid, errorBox, emptyState } from '../components.js';
import { composerForm, depthControl, attachSuggest } from '../composer.js';
import { searchHref, articleHref } from '../router.js';

export async function renderSearch(ctx, route) {
  const wrap = el('div', { class: 'wrap' });
  const query = (route.query.q || '').trim();

  const head = el('div', { class: 'ask-head' });
  head.append(el('h1', { text: query ? `“${query}”` : t('searchResults') }));
  if (query) head.append(el('p', { class: 'ask-note', text: `${t('searchResults')} · ${ctx.state.contentLang}.wikipedia.org` }));
  wrap.append(head);

  const composer = el('div', { class: 'composer' });
  const form = composerForm(ctx, { placeholderKey: 'askPlaceholder', autofocus: !query });
  composer.append(form);
  composer.append(el('p', { class: 'voice-status', id: 'voiceStatus', role: 'status', 'aria-live': 'polite' }));
  attachSuggest(form.querySelector('textarea'), ctx);
  if (query) form.querySelector('textarea').value = query;
  wrap.append(composer);
  wrap.append(depthControl(ctx));

  const results = el('div', { id: 'searchResults' });
  wrap.append(results);

  if (!query) {
    results.append(emptyState({
      iconName: 'search', title: t('searchResults'), body: t('askQuestionBlurb'),
      cta: t('explore'), ctaHref: '#/explore',
    }));
    return wrap;
  }

  results.append(skeletonGrid(6, 'card'));
  runSearch(ctx, results, query, wrap);
  return wrap;
}

async function runSearch(ctx, mount, query, wrap) {
  const lang = ctx.state.contentLang;
  try {
    const hits = await ctx.api.search(lang, query, { limit: 18 });
    if (!hits.length) {
      mount.innerHTML = '';
      mount.append(emptyState({ iconName: 'search', title: t('noResults'), body: t('askQuestionBlurb'), cta: t('askMode'), ctaHref: searchHref(query, { mode: 'ask', lang }) }));
      return;
    }
    const found = await ctx.api.summaries(lang, hits.map((h) => h.title));
    const grid = el('div', { class: 'grid' });
    for (const hit of hits) {
      const page = found.get(hit.title) || {};
      grid.append(card({
        title: hit.title,
        extract: page.extract || '',
        thumb: page.thumb || null,
      }, { lang }));
    }
    mount.innerHTML = '';
    mount.append(grid);

    // A quiet offer to switch from Search to Ask for the same query.
    const ask = el('a', {
      class: 'chip',
      href: searchHref(query, { mode: 'ask', lang }),
      text: `${t('askAboutIt')} →`,
      style: 'margin-top:18px;display:inline-flex',
    });
    mount.append(ask);
  } catch (err) {
    mount.innerHTML = '';
    mount.append(errorBox(err?.message, { onRetry: () => runSearch(ctx, mount, query, wrap) }));
  }
}
