/* indusmova — reading a short article in a fuller translation.
 *
 * Hindi (and most of the other editions) often carry a much shorter article
 * than English for the same subject. A reader who picks Hindi then gets a
 * thinner answer than the one that exists. This offers the full English text
 * translated into the language they chose, so the choice of language costs
 * them nothing in substance.
 *
 * The translation is machine-made and says so; the English original stays one
 * link away. Nothing is invented: only the English article's own sentences are
 * sent for translation.
 */

import { el, esc } from './ui.js';
import { t } from './i18n.js';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

/** One request per chunk; the endpoint takes plain text, not markup. */
async function translateText(text, target, signal) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = await res.json();
  const parts = data?.[0];
  if (!Array.isArray(parts)) throw new Error('translate shape');
  return parts.map((p) => (Array.isArray(p) ? p[0] : '')).join('');
}

/** Split long text into pieces the endpoint will accept. */
function chunks(text, size = 1200) {
  const out = [];
  let buf = '';
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    if ((buf + sentence).length > size && buf) { out.push(buf.trim()); buf = sentence; }
    else buf += ` ${sentence}`;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

async function translateAll(paragraphs, target, signal, onProgress) {
  const done = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    const source = paragraphs[i];
    if (!source || source.length < 2) { done.push(source); continue; }
    try {
      const pieces = chunks(source);
      let out = '';
      for (const piece of pieces) out += `${await translateText(piece, target, signal)} `;
      done.push(out.trim());
    } catch {
      done.push('');                       // a failed paragraph is dropped, not faked
    }
    if (onProgress) onProgress(i + 1, paragraphs.length);
  }
  return done;
}

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
      const blocks = [...root.querySelectorAll('p, li')]
        .map((n) => n.textContent.replace(/\s+/g, ' ').trim())
        .filter((s) => s.length > 60)
        .slice(0, 60);
      if (!blocks.length) throw new Error('nothing to translate');

      const translated = await translateAll(blocks, lang, undefined, (done, total) => {
        status.textContent = `${t('translating')} ${done}/${total}`;
      });

      const panel = el('section', { class: 'translated-article' });
      panel.append(el('h2', { text: title }));
      panel.append(el('p', {
        class: 'src-credit',
        html: `${esc(t('machineTranslated'))} — <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}" target="_blank" rel="noopener noreferrer">English original ↗</a>`,
      }));
      for (const paragraph of translated) {
        if (paragraph) panel.append(el('p', { text: paragraph }));
      }
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
