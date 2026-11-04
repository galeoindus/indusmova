/* indusmova — reading a short article in a fuller translation.
 *
 * Hindi (and most of the other editions) often carry a much shorter article
 * than English for the same subject. A reader who picks Hindi then gets a
 * thinner answer than the one that exists. This offers the full English text
 * translated into the language they chose, so the choice of language costs
 * them nothing in substance.
 *
 * Two things this used to get wrong, both fixed here:
 *
 *   It stopped at sixty blocks. Everything after the sixtieth paragraph simply
 *   was not sent, so a reader could be told they were reading "the full
 *   article" while the later sections were missing. There is no ceiling now:
 *   the whole article is translated, in order, and the offer reports how much
 *   of it actually came back.
 *
 *   It dropped failures. A paragraph the provider refused was stored as an
 *   empty string and vanished from the page. Failures now keep their English
 *   text, are marked as untranslated, and are counted in the result.
 *
 * The translation is machine-made and says so; the English original stays one
 * link away. Nothing is invented: only the English article's own sentences are
 * sent for translation.
 */

import { el, esc } from './ui.js';
import { t } from './i18n.js';
import { translateTexts } from './translate-provider.js';

/**
 * Offer a fuller translation when the chosen edition is materially shorter
 * than English. Called after an article has painted.
 */
export async function offerFullerTranslation(ctx, state) {
  const lang = state?.lang;
  const title = state?.data?.title;
  if (!lang || lang === 'en' || !title) return;
  const main = document.getElementById('main');
  if (!main || main.querySelector('.translate-offer')) return;

  const localLength = (state.root?.textContent || '').replace(/\s+/g, ' ').trim().length;
  if (localLength > 6000) return;          // already a substantial article

  let english = '';
  try {
    english = await ctx.api.extract('en', title);
  } catch {
    return;
  }
  const englishLength = String(english).replace(/\s+/g, ' ').trim().length;
  if (englishLength < localLength * 1.6 || englishLength - localLength < 900) return;

  const box = el('div', { class: 'translate-offer', role: 'note' });
  box.append(el('p', {
    html: `<strong>${esc(t('fullerInEnglish'))}</strong> ${esc(t('fullerBody', {
      lang: lang.toUpperCase(),
      more: String(Math.round(englishLength / 1000)),
    }))}`,
  }));
  const btn = el('button', { type: 'button', class: 'btn btn-primary', text: t('translateFull') });
  const status = el('span', { class: 'translate-status', role: 'status' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.textContent = t('translating');
    try {
      const article = await ctx.api.article('en', title);
      const root = (await import('./parse.js')).clean(article.html);
      // Every qualifying block, in reading order. No ceiling.
      const blocks = [...root.querySelectorAll('p, li')]
        .map((n) => n.textContent.replace(/\s+/g, ' ').trim())
        .filter((s) => s.length > 60);
      if (!blocks.length) throw new Error('nothing to translate');

      const results = await translateTexts(blocks, lang, {
        source: 'en',
        onProgress: (done, total) => {
          status.textContent = `${t('translating')} ${done}/${total}`;
        },
      });

      const panel = el('section', { class: 'translated-article' });
      panel.lang = lang;
      panel.append(el('h2', { text: title }));
      panel.append(el('p', {
        class: 'src-credit',
        html: `${esc(t('machineTranslated'))} — <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}" target="_blank" rel="noopener noreferrer">English original ↗</a>`,
      }));

      let failed = 0;
      results.forEach((result, i) => {
        if (result.status === 'translated') {
          panel.append(el('p', { text: result.text }));
        } else if (result.status === 'failed') {
          // Keep the English words rather than leaving a hole, and say so.
          failed += 1;
          const p = el('p', { text: blocks[i], 'data-untranslated': 'true' });
          panel.append(p);
        } else {
          panel.append(el('p', { text: blocks[i] }));
        }
      });
      if (failed) panel.append(el('p', { class: 'tr-partial', text: t('translatePartial', { count: String(failed) }) }));

      box.replaceWith(panel);
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      btn.disabled = false;
      status.textContent = t('translateFailed');
    }
  });
  box.append(btn, status);
  main.prepend(box);
}
