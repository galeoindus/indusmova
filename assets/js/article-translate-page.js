/* The same Translate control, on the thirteen standalone article pages.
 *
 * Those pages are plain HTML served straight from disk, not views of the app
 * shell, so they cannot use the article view's tab strip. They get one button
 * in the action row instead, which opens the same language picker and
 * translates the article in place — the same walker, the same endpoints, the
 * same promise: every heading, paragraph and table cell translated, the
 * pictures left exactly where they are.
 *
 * One press, not two: the panel opens on the languages themselves, and
 * choosing one starts the translation immediately. The button that used to
 * sit beside the dropdown ("Translate the whole article") is gone, because
 * choosing a language *is* the request.
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

  const choose = el('div', { class: 'tr-choose' });
  choose.append(el('h2', { class: 'tr-title', text: 'Read this article in your language' }));
  choose.append(el('p', {
    class: 'tr-sub',
    text: 'Pick a language. The whole article — every heading, paragraph and table — is translated at once, and the pictures stay exactly where they are.',
  }));

  const filter = el('input', {
    type: 'search', class: 'tr-filter', id: 'pageTrFilter', autocomplete: 'off',
    placeholder: 'Search a language', 'aria-label': 'Search a language',
  });
  choose.append(filter);

  const grid = el('div', { class: 'tr-langs', role: 'group', 'aria-label': 'Read this article in' });
  const groups = [
    { label: 'India and the neighbourhood', items: WORLD_LANGS.slice(0, 31) },
    { label: 'Rest of the world', items: WORLD_LANGS.slice(31) },
  ];
  const buttons = [];
  for (const group of groups) {
    const row = el('div', { class: 'tr-group-grid' });
    for (const lang of group.items) {
      const btn = el('button', {
        type: 'button', class: 'tr-lang',
        dataset: { code: lang.code, search: `${lang.code} ${lang.name} ${lang.native}`.toLowerCase() },
        'aria-label': `${lang.native} — ${lang.name}`,
      }, [el('b', { text: lang.native }), el('span', { text: lang.name })]);
      btn.addEventListener('click', () => runTranslation(lang.code));
      row.append(btn);
      buttons.push(btn);
    }
    grid.append(el('p', { class: 'tr-group', text: group.label }), row);
  }
  choose.append(grid);
  const noMatch = el('p', { class: 'tr-empty', hidden: true, text: 'No language matched that.' });
  choose.append(noMatch);

  const read = el('div', { class: 'tr-read', hidden: true });
  const bar = el('div', { class: 'tr-readbar' });
  const current = el('p', { class: 'tr-current', role: 'status', 'aria-live': 'polite' });
  const stop = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Stop', hidden: true });
  const change = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Change language' });
  bar.append(current, el('span', { class: 'tr-grow' }), stop, change);
  read.append(bar);

  const status = el('p', { class: 'tr-status', role: 'status', 'aria-live': 'polite' });
  const track = el('div', { class: 'tr-track', 'aria-hidden': 'true' }, [el('span')]);
  track.hidden = true;
  const out = el('div', { class: 'tr-body' });
  read.append(status, track, out);

  panel.append(choose, read);
  body.before(panel);

  // The original stays on the page; the translated copy goes underneath it.
  const original = body.cloneNode(true);
  let controller = null;

  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const btn of buttons) {
      const hit = !q || btn.dataset.search.includes(q);
      btn.hidden = !hit;
      if (hit) shown += 1;
    }
    grid.querySelectorAll('.tr-group-grid').forEach((row) => {
      const any = [...row.children].some((b) => !b.hidden);
      row.hidden = !any;
      const head = row.previousElementSibling;
      if (head?.classList.contains('tr-group')) head.hidden = !any;
    });
    noMatch.hidden = shown > 0;
  });

  function showChooser() {
    controller?.abort();
    controller = null;
    choose.hidden = false;
    read.hidden = true;
    out.replaceChildren();
    filter.focus();
  }

  async function runTranslation(code) {
    const record = langRecord(code);
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    choose.hidden = true;
    read.hidden = false;
    out.replaceChildren();
    current.textContent = `${record.native} · ${record.name}`;
    status.textContent = `Translating — ${record.native}`;
    track.hidden = false;
    track.querySelector('span').style.width = '4%';
    stop.hidden = false;

    const clone = original.cloneNode(true);
    clone.querySelectorAll('button, .md-disclosure, .fb-row, [role="status"]').forEach((n) => n.remove());

    try {
      const result = await translateFragment(clone, code, {
        signal,
        onProgress: (done, total) => {
          const pct = total ? Math.round((done / total) * 100) : 100;
          track.querySelector('span').style.width = `${Math.max(4, pct)}%`;
          status.textContent = `Translating — ${record.native} · ${done}/${total}`;
        },
      });
      if (signal.aborted) return;

      out.setAttribute('lang', code);
      out.setAttribute('dir', isRtlLang(code) ? 'rtl' : 'ltr');

      const note = el('div', { class: 'tr-note' }, [
        el('p', { html: `<strong>Translated.</strong> Machine translation of this article in ${record.native}. The pictures, tables and layout are unchanged; the original is directly above.` }),
      ]);
      if (result.failed) {
        note.append(el('p', { class: 'tr-partial', text: `${result.failed} passage(s) could not be translated and are shown in the original language.` }));
      }
      out.append(note, clone);
      status.textContent = `Translated — ${record.native}`;
      track.querySelector('span').style.width = '100%';
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      status.textContent = err?.name === 'AbortError'
        ? 'Translation stopped.'
        : 'The translation could not be completed. Please try again.';
    } finally {
      if (controller?.signal === signal) {
        controller = null;
        stop.hidden = true;
        track.hidden = true;
      }
    }
  }

  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      choose.hidden = false;
      read.hidden = true;
      out.replaceChildren();
      filter.focus();
    } else {
      controller?.abort();
      controller = null;
    }
  });

  change.addEventListener('click', showChooser);
  stop.addEventListener('click', () => {
    controller?.abort();
    controller = null;
    stop.hidden = true;
    track.hidden = true;
  });
}
