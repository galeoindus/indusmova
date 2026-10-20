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

/** The text field + tools. `ctx.onSubmit(text)` fires on submit. */
export function composerForm(ctx, { placeholderKey = 'askPlaceholder', autofocus = false } = {}) {
  const form = el('form', { class: 'searchbar glass', id: 'searchForm', role: 'search', autocomplete: 'off' });

  const textarea = el('textarea', {
    id: 'searchInput', name: 'q', rows: '1', maxlength: '600',
    placeholder: t(placeholderKey), 'aria-label': t('askPlaceholder'),
    'data-i18n-ph': placeholderKey,
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

  // Mode toggle
  const mode = el('div', { class: 'mode', role: 'group', 'aria-label': 'Search or ask' });
  for (const value of ['search', 'ask']) {
    const btn = el('button', {
      type: 'button',
      class: `mode-btn${ctx.state.mode === value ? ' is-active' : ''}`,
      dataset: { mode: value },
      'aria-pressed': String(ctx.state.mode === value),
      text: value === 'search' ? t('searchMode') : t('askMode'),
    });
    btn.addEventListener('click', () => {
      ctx.setMode(value);
      mode.querySelectorAll('.mode-btn').forEach((b) => {
        const active = b.dataset.mode === value;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      submitBtn.textContent = value === 'search' ? t('send') : t('askMode');
    });
    mode.append(btn);
  }
  tools.append(mode);

  const submitBtn = el('button', {
    type: 'submit', class: 'btn btn-primary',
    text: ctx.state.mode === 'search' ? t('send') : t('askMode'),
  });
  tools.append(submitBtn);
  form.append(tools);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = textarea.value.trim();
    if (!value) return;
    ctx.onSubmit(value);
  });

  // Grow the textarea with its content, up to a cap.
  const grow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(120, textarea.scrollHeight)}px`;
  };
  textarea.addEventListener('input', grow);
  requestAnimationFrame(grow);
  if (autofocus) setTimeout(() => textarea.focus(), 60);

  // Keyboard: Enter submits, Shift+Enter is a newline.
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  ctx._composer = { form, textarea };
  return form;
}

function wireVoice(button, textarea, ctx) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = () => document.getElementById('voiceStatus');
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

/** Answer depth + the meaning-ranking switch. */
export function depthControl(ctx) {
  const wrap = el('div', { class: 'dash-depth' });

  const depth = el('div', { class: 'depth', role: 'group', 'aria-label': t('answerDepth') });
  depth.append(el('span', { class: 'depth-label', text: t('answerDepth') }));
  for (const preset of Object.values(DEPTHS)) {
    const btn = el('button', {
      type: 'button',
      class: `depth-btn${ctx.state.depth === preset.id ? ' is-active' : ''}`,
      dataset: { depth: preset.id },
      'aria-pressed': String(ctx.state.depth === preset.id),
      text: preset.label,
    });
    btn.addEventListener('click', () => {
      ctx.setDepth(preset.id);
      depth.querySelectorAll('.depth-btn').forEach((b) => {
        const active = b.dataset.depth === preset.id;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    });
    depth.append(btn);
  }
  wrap.append(depth);

  const deep = el('button', {
    type: 'button',
    class: `chip-btn deep-btn${ctx.state.deepRank ? ' is-on' : ''}`,
    dataset: { deep: ctx.state.deepRank ? 'on' : 'off' },
    'aria-pressed': String(ctx.state.deepRank),
    title: t('understandMeaningTitle'),
    html: `${icon('sparkle')}${esc(t('understandMeaning'))}`,
  });
  deep.addEventListener('click', () => ctx.toggleDeepRank(deep));
  wrap.append(deep);

  return wrap;
}

/** A row of chips. Each may be a link (href) or a button (onClick). */
export function chipRow(items, { onPick, justify = false } = {}) {
  const wrap = el('div', { class: 'chips', id: 'quickChips' });
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

/** Suggest-as-you-type dropdown bound to a textarea. */
export function attachSuggest(textarea, ctx) {
  const box = el('div', { class: 'suggest', hidden: true });
  textarea.parentElement.append(box);
  const run = debounce(async (value) => {
    if (value.length < 2) {
      box.hidden = true;
      return;
    }
    try {
      const hits = await ctx.suggest(value);
      if (!hits.length) {
        box.hidden = true;
        return;
      }
      box.innerHTML = '';
      for (const hit of hits) {
        const row = el('a', {
          class: 'suggest-item',
          href: '#',
          html: `${hit.thumb ? `<img src="${hit.thumb}" alt="" loading="lazy" width="34" height="34">` : ''}
                 <span><span class="si-title">${esc(hit.title)}</span>${hit.description ? `<span class="si-desc">${esc(hit.description)}</span>` : ''}</span>`,
        });
        row.addEventListener('click', (event) => {
          event.preventDefault();
          box.hidden = true;
          textarea.value = hit.title;
          ctx.onSubmit(hit.title);
        });
        box.append(row);
      }
      box.hidden = false;
    } catch {
      box.hidden = true;
    }
  }, 220);
  textarea.addEventListener('input', () => run(textarea.value.trim()));
  textarea.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  return box;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
