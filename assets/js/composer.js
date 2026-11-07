/* indusmova — the ask/search composer.
 *
 * One form serves the whole product. It carries the two modes (Search, Ask),
 * the answer-depth control, the optional on-device "Understand meaning" switch,
 * a voice button where the browser supports one, and the example chips. It
 * reports intent back through the context object rather than navigating itself,
 * so the home, ask and search views can each decide what a submit means.
 */

import { el, debounce } from './ui.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { DEPTHS } from './config.js';

/** The three depth presets, in the reader's interface language. */
const DEPTH_KEYS = { quick: 'quickAnswer', detailed: 'detailed', deep: 'deepDive' };

/**
 * The text field + tools. `ctx.onSubmit(text)` fires on submit.
 *
 * `onSubmit` overrides that for one form only. The search page needs it: its
 * box must always search, even when the reader last used Ask somewhere else,
 * and it must not change the reader's saved preference to get that.
 */
export function composerForm(ctx, { placeholderKey = 'askPlaceholder', autofocus = false, initialMode = null, labelled = false, onSubmit = null } = {}) {
  const form = el('form', { class: 'searchbar glass', id: 'searchForm', role: 'search', autocomplete: 'off' });

  // A visible label, not a placeholder doing the work of one.
  if (labelled) form.append(el('span', { class: 'composer-label', text: t('fieldLabel') }));

  const textarea = el('textarea', {
    id: 'searchInput', name: 'q', rows: '1', maxlength: '600',
    placeholder: t(placeholderKey), 'aria-label': t('fieldLabel'),
    'aria-describedby': 'composerHelp', 'data-i18n-ph': placeholderKey,
  });
  form.append(textarea);

  const tools = el('div', { class: 'composer-tools' });

  // Voice
  const micBtn = el('button', {
    type: 'button', class: 'btn btn-ghost btn-icon mic-btn', id: 'micBtn',
    'aria-label': t('voiceAria'), title: t('voiceAria'), 'aria-pressed': 'false',
    html: icon('mic'),
  });
  tools.append(micBtn);
  wireVoice(micBtn, textarea, ctx);

  // Clear, only while there is something to clear.
  const clearBtn = el('button', {
    type: 'button', class: 'btn btn-ghost btn-icon', id: 'clearBtn', hidden: true,
    'aria-label': t('clearLabel'), title: t('clearLabel'), html: icon('close'),
  });
  clearBtn.addEventListener('click', () => {
    textarea.value = '';
    textarea.dispatchEvent(new Event('input'));
    textarea.focus();
  });
  tools.append(clearBtn);

  // The two intentions, named the way a person would name them.
  const mode = el('div', { class: 'mode', role: 'group', 'aria-label': t('modeGroup') });
  const active = initialMode || ctx.state.mode;
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary' });
  const help = el('p', { class: 'mode-help', id: 'composerHelp', role: 'status' });

  /* On a phone the two intentions have to fit on one control row beside the
     mic and Send. "Ask a question" and "Find an article" are the right words
     on a desktop and about 40 px too wide at 390, so the short pair is used
     there — the full label stays in the button's accessible name. */
  // `matchMedia` is absent in a few test and embed environments; when it is,
  // the full labels are simply used, which is the desktop behaviour.
  const narrow = typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 700px)')
    : { matches: false, addEventListener() {} };
  const labelFor = (value) => {
    const full = value === 'search' ? t('findArticleLabel') : t('askModeLabel');
    if (!narrow.matches) return full;
    return value === 'search' ? t('findShort') : t('askShort');
  };

  const paintMode = (value) => {
    mode.querySelectorAll('.mode-btn').forEach((b) => {
      const on = b.dataset.mode === value;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = labelFor(b.dataset.mode);
      b.setAttribute('aria-label', b.dataset.mode === 'search' ? t('findArticleLabel') : t('askModeLabel'));
      b.title = b.dataset.mode === 'search' ? t('findArticleLabel') : t('askModeLabel');
    });
    submitBtn.textContent = value === 'search' ? t('submitSearch') : t('submitAsk');
    help.textContent = value === 'search' ? t('modeHelpSearch') : t('modeHelpAsk');
  };

  // Relabelling on a rotation or a resize costs nothing and avoids a mode
  // switch that says "Ask" on a desktop.
  narrow.addEventListener?.('change', () => paintMode(ctx.state.mode));

  for (const value of ['ask', 'search']) {
    const btn = el('button', {
      type: 'button',
      class: `mode-btn${active === value ? ' is-active' : ''}`,
      dataset: { mode: value },
      'aria-pressed': String(active === value),
      text: value === 'search' ? t('findArticleLabel') : t('askModeLabel'),
    });
    btn.addEventListener('click', () => {
      ctx.setMode(value);
      paintMode(value);
    });
    mode.append(btn);
  }
  tools.append(mode);
  tools.append(submitBtn);
  form.append(tools);
  paintMode(active);
  form.append(help);

  // An empty submit explains itself instead of doing nothing.
  const prompt = el('p', { class: 'composer-prompt', hidden: true, role: 'alert' });
  form.append(prompt);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = textarea.value.trim();
    if (!value) {
      prompt.textContent = t('emptyPrompt');
      prompt.removeAttribute('hidden');
      textarea.focus();
      return;
    }
    prompt.setAttribute('hidden', '');
    if (typeof onSubmit === 'function') onSubmit(value);
    else ctx.onSubmit(value);
  });

  // Grow the textarea with its content, up to a cap.
  const grow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(120, textarea.scrollHeight)}px`;
    clearBtn.hidden = !textarea.value;
    if (textarea.value) prompt.setAttribute('hidden', '');
  };
  textarea.addEventListener('input', grow);
  requestAnimationFrame(grow);
  if (autofocus) setTimeout(() => textarea.focus(), 60);

  // Enter submits, Shift+Enter is a newline, Escape clears the suggestions.
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  // Read the mode live rather than from the `active` const captured above:
  // clicking a mode button calls ctx.setMode(), which the const never saw, so
  // this accessor reported the mode the form opened in for ever.
  ctx._composer = { form, textarea, mode: () => ctx.state.mode };
  return form;
}

function wireVoice(button, textarea, ctx) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // The status line belongs to this composer, not to the document.
  //
  // It used to be looked up by id, and every view that renders a composer
  // wrote the same id="voiceStatus" — so the home page and the search page
  // both owned it, and the first one in the document answered for all of
  // them. Walking up from the field finds the one this button sits in.
  const status = () => textarea.closest('form')?.parentElement?.querySelector('.voice-status') || null;
  if (!SR) {
    button.addEventListener('click', () => {
      const s = status();
      if (s) s.textContent = t('voiceUnsupported');
    });
    button.disabled = true;
    button.title = t('voiceUnsupported');
    return;
  }
  const recognition = new SR();
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.lang = ctx.state.contentLang === 'hi' ? 'hi-IN' : 'en-IN';

  let listening = false;
  recognition.addEventListener('result', (event) => {
    const transcript = [...event.results].map((r) => r[0].transcript).join('');
    textarea.value = transcript;
    textarea.dispatchEvent(new Event('input'));
  });
  recognition.addEventListener('end', () => {
    listening = false;
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('is-listening');
    const s = status();
    if (s) s.textContent = '';
    if (textarea.value.trim()) textarea.form?.requestSubmit();
  });
  recognition.addEventListener('error', () => {
    listening = false;
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('is-listening');
    const s = status();
    if (s) s.textContent = t('voiceUnsupported');
  });

  button.addEventListener('click', () => {
    const s = status();
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
      listening = true;
      button.setAttribute('aria-pressed', 'true');
      button.classList.add('is-listening');
      if (s) s.textContent = t('voiceListening');
    } catch {
      if (s) s.textContent = t('voiceUnsupported');
    }
  });
}

/** Answer depth + the meaning-ranking switch + a bar showing the level. */
export function depthControl(ctx) {
  const wrap = el('div', { class: 'dash-depth' });

  const depth = el('div', { class: 'depth', role: 'group', 'aria-label': t('answerDepth'), dataset: { level: ctx.state.depth } });
  depth.append(el('span', { class: 'depth-label', text: t('answerDepth') }));
  for (const preset of Object.values(DEPTHS)) {
    const btn = el('button', {
      type: 'button',
      class: `depth-btn${ctx.state.depth === preset.id ? ' is-active' : ''}`,
      dataset: { depth: preset.id },
      'aria-pressed': String(ctx.state.depth === preset.id),
      text: t(DEPTH_KEYS[preset.id] || 'detailed'),
    });
    btn.addEventListener('click', () => {
      ctx.setDepth(preset.id);
      depth.querySelectorAll('.depth-btn').forEach((b) => {
        const active = b.dataset.depth === preset.id;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      // Re-render the open answer straight away — no second click, no reload.
      ctx.optionsChanged?.();
    });
    depth.append(btn);
  }
  wrap.append(depth);

  const deep = el('button', {
    type: 'button',
    class: `chip-btn deep-btn${ctx.state.deepRank ? ' is-on' : ''}`,
    'aria-label': t('meaningOption'),
    dataset: { deep: ctx.state.deepRank ? 'on' : 'off' },
    'aria-pressed': String(ctx.state.deepRank),
    title: t('meaningOption'),
    html: `${icon('sparkle')}<span>${esc(t('understandMeaning'))}</span>`,
  });
  deep.addEventListener('click', () => {
    ctx.toggleDeepRank(deep);
    ctx.optionsChanged?.();
  });
  wrap.append(deep);

  return wrap;
}

/** A row of chips. Each may be a link (href) or a button (onClick). */
export function chipRow(items, { onPick, justify = false } = {}) {
  // No id: the home page renders two chip rows, and a shared id made the
  // document invalid and gave both rows the same anchor target.
  const wrap = el('div', { class: 'chips' });
  if (justify) wrap.style.justifyContent = 'flex-start';
  for (const item of items) {
    const isObj = typeof item === 'object';
    const label = isObj ? item.label : item;
    const chip = el('a', { class: 'chip', text: label, href: isObj && item.href ? item.href : '#' });
    chip.addEventListener('click', (event) => {
      if (!isObj || !item.href) event.preventDefault();
      onPick?.(isObj ? item.value ?? label : label);
    });
    wrap.append(chip);
  }
  return wrap;
}

/** Suggest-as-you-type dropdown bound to a textarea.
 *
 * It is a real combobox: the field owns the listbox, arrow keys move through
 * the options, Enter takes the active one, Escape closes the panel, and a
 * response for an older query can never overwrite a newer one. */
let suggestSequence = 0;

export function attachSuggest(textarea, ctx) {
  const id = `${textarea.id || 'search'}-suggestions-${++suggestSequence}`;
  const box = el('div', { class: 'suggest', id, role: 'listbox', hidden: true });
  textarea.setAttribute('role', 'combobox');
  textarea.setAttribute('aria-autocomplete', 'list');
  textarea.setAttribute('aria-controls', id);
  textarea.setAttribute('aria-expanded', 'false');
  textarea.setAttribute('aria-haspopup', 'listbox');
  textarea.parentElement.append(box);

  let requestId = 0;
  let activeIndex = -1;
  let rows = [];

  const hide = () => {
    box.hidden = true;
    activeIndex = -1;
    textarea.setAttribute('aria-expanded', 'false');
    textarea.removeAttribute('aria-activedescendant');
  };
  const clearSuggestions = () => {
    hide();
    rows = [];
    box.replaceChildren();
  };
  const select = (hit) => {
    if (!hit) return;
    clearSuggestions();
    textarea.value = hit.title;
    ctx.onSubmit(hit.title);
  };
  const setActive = (index) => {
    if (!rows.length) return;
    activeIndex = (index + rows.length) % rows.length;
    rows.forEach((row, i) => {
      const active = i === activeIndex;
      row.classList.toggle('active', active);
      row.setAttribute('aria-selected', String(active));
    });
    textarea.setAttribute('aria-activedescendant', rows[activeIndex].id);
    rows[activeIndex].scrollIntoView?.({ block: 'nearest' });
  };

  const run = debounce(async (value, currentRequest) => {
    if (value.length < 2) { clearSuggestions(); return; }
    try {
      const hits = await ctx.suggest(value);
      if (currentRequest !== requestId) return; // a newer query already ran
      if (!hits.length) { clearSuggestions(); return; }
      box.replaceChildren();
      rows = [];
      activeIndex = -1;
      hits.forEach((hit, index) => {
        const row = el('a', {
          class: 'suggest-item', href: '#', role: 'option',
          id: `${id}-option-${index}`, 'aria-selected': 'false',
        });
        if (hit.thumb) row.append(el('img', { src: hit.thumb, alt: '', loading: 'lazy', width: '34', height: '34', decoding: 'async' }));
        const text = el('span');
        text.append(el('span', { class: 'si-title', text: hit.title }));
        if (hit.description) text.append(el('span', { class: 'si-desc', text: hit.description }));
        row.append(text);
        row.addEventListener('click', (event) => { event.preventDefault(); select(hit); });
        row.addEventListener('mousemove', () => setActive(index));
        rows.push(row);
        box.append(row);
      });
      box.hidden = false;
      textarea.setAttribute('aria-expanded', 'true');
    } catch {
      if (currentRequest === requestId) clearSuggestions();
    }
  }, 220);

  textarea.addEventListener('input', () => {
    const value = textarea.value.trim();
    requestId += 1;
    clearSuggestions();
    if (value.length < 2) return;
    run(value, requestId);
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && !box.hidden) { event.preventDefault(); setActive(activeIndex + 1); }
    else if (event.key === 'ArrowUp' && !box.hidden) { event.preventDefault(); setActive(activeIndex < 0 ? rows.length - 1 : activeIndex - 1); }
    else if (event.key === 'Escape' && !box.hidden) { event.preventDefault(); clearSuggestions(); }
    else if (event.key === 'Enter' && !box.hidden && activeIndex >= 0) {
      event.preventDefault();
      const hit = rows[activeIndex];
      select({ title: hit.querySelector('.si-title')?.textContent || '' });
    }
  });
  textarea.addEventListener('blur', () => setTimeout(hide, 150));
  textarea.addEventListener('focus', () => {
    if (rows.length && textarea.value.trim().length >= 2) {
      box.hidden = false;
      textarea.setAttribute('aria-expanded', 'true');
    }
  });
  return box;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
