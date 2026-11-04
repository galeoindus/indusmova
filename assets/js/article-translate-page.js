/* The same Translate control, on the thirteen standalone article pages.
 *
 * Those pages are plain HTML served straight from disk, not views of the app
 * shell, so they cannot use the article view's tab strip. They get one button
 * in the action row instead, which opens the same language picker and
 * translates the article in place — the same walker, the same endpoints, the
 * same promise: every heading, paragraph and table cell translated, the
 * pictures left exactly where they are.
 *
 * It is a progressive enhancement. Without this file the page is a complete,
 * readable article; nothing here is required to read it.
 */
import { translateFragment } from './article-translate.js';
import { WORLD_LANGS, langRecord, isRtlLang } from './world-langs.js';

/* Wait for the document if it is still being parsed.
 *
 * A module can be evaluated while the parser is still working — and on these
 * pages it was, so the guard found no `.article-actions` and quietly did
 * nothing. The button then only appeared if the module happened to be
 * imported a second time. Deferring to DOMContentLoaded (or running at once
 * when the document is already complete) removes the race entirely. */
function start() {
  const actions = document.querySelector('.article-actions');
  const body = document.querySelector('.article-grid');
  if (actions && body && !document.getElementById('pageTranslate')) build(actions, body);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function build(actions, body) {
  const button = el('button', {
    type: 'button', class: 'btn btn-ghost', id: 'pageTranslate',
    'aria-expanded': 'false', 'aria-controls': 'pageTranslatePanel',
    text: 'Translate',
  });
  actions.append(button);

  const panel = el('div', { class: 'tr-panel', id: 'pageTranslatePanel', hidden: true });
  const bar = el('div', { class: 'tr-bar' });

  const pick = el('label', { class: 'tr-pick' }, [el('span', { text: 'Read this article in' })]);
  const select = el('select', { class: 'tr-select', 'aria-label': 'Read this article in' });
  const groups = [
    { label: 'India and the neighbourhood', items: WORLD_LANGS.slice(0, 31) },
    { label: 'Rest of the world', items: WORLD_LANGS.slice(31) },
  ];
  for (const group of groups) {
    const optgroup = el('optgroup', { label: group.label });
    for (const lang of group.items) {
      optgroup.append(el('option', { value: lang.code, text: `${lang.native} — ${lang.name}` }));
    }
    select.append(optgroup);
  }
  select.value = 'hi';
  pick.append(select);

  const run = el('button', { type: 'button', class: 'btn btn-primary', text: 'Translate the whole article' });
  const stop = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Stop', hidden: true });
  bar.append(pick, run, stop);

  const status = el('p', { class: 'tr-status', role: 'status', 'aria-live': 'polite',
    text: 'Choose a language and the whole article is translated — every heading, paragraph and table, with the pictures left exactly where they are.' });
  const track = el('div', { class: 'tr-track', 'aria-hidden': 'true' }, [el('span')]);
  track.hidden = true;
  const out = el('div', { class: 'tr-body' });

  panel.append(bar, status, track, out);
  body.before(panel);

  // The original stays on the page; the translated copy goes underneath it.
  const original = body.cloneNode(true);
  let controller = null;

  const setBusy = (busy) => {
    run.disabled = busy;
    select.disabled = busy;
    stop.hidden = !busy;
    track.hidden = !busy;
    run.textContent = busy ? 'Translating' : 'Translate the whole article';
  };

  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) select.focus();
  });

  run.addEventListener('click', async () => {
    const target = select.value;
    const record = langRecord(target);
    controller = new AbortController();
    setBusy(true);
    out.replaceChildren();
    status.textContent = `Translating — ${record.native}`;
    track.querySelector('span').style.width = '4%';

    const clone = original.cloneNode(true);
    clone.querySelectorAll('button, .md-disclosure, .fb-row, [role="status"]').forEach((n) => n.remove());

    try {
      const result = await translateFragment(clone, target, {
        signal: controller.signal,
        onProgress: (done, total) => {
          const pct = total ? Math.round((done / total) * 100) : 100;
          track.querySelector('span').style.width = `${Math.max(4, pct)}%`;
          status.textContent = `Translating — ${record.native} · ${done}/${total}`;
        },
      });
      out.setAttribute('lang', target);
      out.setAttribute('dir', isRtlLang(target) ? 'rtl' : 'ltr');

      const note = el('div', { class: 'tr-note' }, [
        el('p', { html: `<strong>Translated.</strong> Machine translation of this article in ${record.native}. The pictures, tables and layout are unchanged; the original is directly above.` }),
      ]);
      if (result.failed) {
        note.append(el('p', { class: 'tr-partial', text: `${result.failed} passage(s) could not be translated and are shown in the original language.` }));
      }
      out.append(note, clone);
      status.textContent = `Translated — ${record.native}`;
      track.querySelector('span').style.width = '100%';
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      status.textContent = err?.name === 'AbortError'
        ? 'Translation stopped.'
        : 'The translation could not be completed. Please try again.';
    } finally {
      controller = null;
      setBusy(false);
      track.hidden = true;
    }
  });

  stop.addEventListener('click', () => controller?.abort());
}
