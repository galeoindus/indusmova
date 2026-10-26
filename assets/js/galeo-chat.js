/* Galeoindus — the chat page.
 *
 * Two answer engines, one interface:
 *
 *   1. the model, through /api/chat, which holds up to six OpenRouter keys
 *      on the server and rotates them;
 *   2. the encyclopedia, read straight from Wikipedia and Wikidata, with no
 *      key at all.
 *
 * The page tries the model first. If the function is missing, has no keys,
 * or every key fails, it answers from the article instead — so the chat is
 * never dead, and a key is never exposed to the browser.
 *
 * The Amigo pack (./galeo-skills.js) decides how a reply is shaped. It is
 * never shown as a list.
 */

import { route, SHAPE_OF } from './galeo-skills.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (t) => String(t || '').trim().replace(/\s+/g, '_');
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayOf = (ms) => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

/* the extra styling for the newer parts of the interface */
if (!document.querySelector('link[data-galeo-polish]')) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = '/assets/css/galeo-polish.css?v=1.0.0';
  l.setAttribute('data-galeo-polish', '');
  document.head.append(l);
}

/* ── icons ─────────────────────────────────────────────────────────────── */
const I = {
  mark: '<svg viewBox="0 0 40 40"><defs><linearGradient id="av" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f9e"/><stop offset="1" stop-color="#7b6bff"/></linearGradient></defs><rect width="40" height="40" rx="13" fill="url(#av)"/><path d="M11.6 12.4h16.8a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4h-7.6L15.4 30.2v-3.8h-3.8a3.4 3.4 0 0 1-3.4-3.4v-7.2a3.4 3.4 0 0 1 3.4-3.4Z" fill="none" stroke="#fff" stroke-width="2.1" stroke-linejoin="round"/><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"><path d="M14.6 17.4c1.8-2.1 3.6-2.1 5.4 0s3.6 2.1 5.4 0"/><path d="M14.6 21.9c1.8-2.1 3.6-2.1 5.4 0s3.6 2.1 5.4 0" stroke-opacity=".72"/></g></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  again: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5V20.5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></svg>',
};

/* ── storage ───────────────────────────────────────────────────────────── */
const KEY = 'galeoindus:threads:v1';
const PREFS = 'galeoindus:prefs:v1';

let threads = [];
let activeId = null;
let prefs = { theme: 'dark', lang: 'en' };
let busy = false;

function read() {
  try {
    threads = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(threads)) threads = [];
  } catch { threads = []; }
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { /* ignore */ }
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(threads.slice(0, 40)));
    localStorage.setItem(PREFS, JSON.stringify(prefs));
  } catch { /* private mode: still works for this session */ }
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const current = () => threads.find((t) => t.id === activeId) || null;

function newThread() {
  const t = { id: uid(), title: 'New chat', messages: [], at: Date.now() };
  threads.unshift(t);
  activeId = t.id;
  write();
  renderThreads();
  renderThread();
  $('input').focus();
  return t;
}

function openThread(id) {
  activeId = id;
  renderThreads();
  renderThread();
  $('app').classList.remove('side-open');
}

function deleteThread(id) {
  threads = threads.filter((t) => t.id !== id);
  if (activeId === id) activeId = threads[0]?.id || null;
  write();
  renderThreads();
  renderThread();
}

/* ── the two engines ───────────────────────────────────────────────────── */

/** The model, through the server function that holds the keys. */
async function askModel(history, mode) {
  const messages = history.slice(-8).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.role === 'user' ? (m.text || '') : [m.lead, m.body, m.close].filter(Boolean).join('\n\n'),
  }));
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, messages }),
    });
    if (!res.ok) return null;                 // 501/404/503 → use the article
    const data = await res.json();
    const text = typeof data?.reply === 'string' ? data.reply.trim() : '';
    if (!text) return null;
    return { body: text, via: 'model', model: data.model || '' };
  } catch { return null; }
}

/** The encyclopedia, which needs no key at all. */
async function lookup(lang, query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search',
    gsrsearch: query, gsrlimit: '1', prop: 'extracts|pageimages', exintro: '1',
    explaintext: '1', exchars: '900', piprop: 'thumbnail', pithumbsize: '360', redirects: '1',
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages;
  const page = Array.isArray(pages) ? pages[0] : (pages ? Object.values(pages)[0] : null);
  if (!page || page.missing || !page.extract) return null;
  return { title: page.title, extract: page.extract };
}

const GREETING = /^(hi|hello|hey|namaste|namaskar|hii|hola|salaam|good (morning|evening|afternoon))\b/i;

function fromArticle(found, skill) {
  const shape = SHAPE_OF(skill?.mode || 'default');
  return {
    lead: shape.lead,
    body: found.extract,
    close: shape.close,
    source: { title: found.title, href: `/articles/${slug(found.title)}/` },
    via: 'article',
  };
}

function greeting() {
  return {
    lead: 'Hello.',
    body: 'Ask me about a person, a place, an event or an idea, and I will bring back what the published sources say, with the article attached so you can check it.',
    close: 'You can also just think out loud — I will keep up.',
    via: 'article',
  };
}

function care(skill) {
  const shape = SHAPE_OF('support');
  return {
    lead: shape.lead,
    body: 'I am here to help you think it through, and I will not guess at how you feel. If there is a fact behind it — a person, a place, something that happened — I can look that up properly and show you where it comes from.',
    close: shape.close,
    via: 'article',
  };
}

function missed(skill) {
  const shape = SHAPE_OF(skill?.mode || 'default');
  const hint = skill ? `This reads like a ${skill.title.toLowerCase()} question. ` : '';
  return {
    lead: shape.lead,
    body: `${hint}I could not find a published article for that, and I would rather say so than make something up.`,
    close: 'Try a name, a place, an event or a thing, and I will pull the article and keep its source attached.',
    via: 'article',
    retry: true,
  };
}

const FOLLOW_UPS = {
  study: ['Give me an example', 'What is the first step?', 'Test me on this'],
  data: ['What would change your mind?', 'How do I measure it?', 'Show the breakdown'],
  critique: ['How would you fix it?', 'What is the weakest part?', 'Compare two options'],
  code: ['Show the patch', 'How do I test it?', 'What could break?'],
  default: ['Tell me more', 'Where does that come from?', 'What else is related?'],
};

/* ── the ask loop ──────────────────────────────────────────────────────── */

async function ask(text, { fromRetry = false } = {}) {
  const value = String(text || '').trim();
  if (!value || busy) return;
  const thread = current() || newThread();
  busy = true;
  setSendDisabled(true);

  if (!fromRetry) {
    thread.messages.push({ role: 'user', text: value, at: Date.now() });
    if (thread.title === 'New chat') thread.title = value.slice(0, 46);
  }
  thread.at = Date.now();
  write();
  renderThreads();
  renderThread();

  const skill = route(value);
  const typing = showTyping();

  let reply = null;
  try {
    if (skill?.mode !== 'support' && !GREETING.test(value)) {
      reply = await askModel(thread.messages, skill?.mode || 'default');
    }
    if (!reply) {
      if (GREETING.test(value.trim()) && value.trim().split(/\s+/).length <= 4) reply = greeting();
      else if (skill?.mode === 'support') reply = care(skill);
      else {
        const found = await lookup(prefs.lang, value);
        reply = found ? fromArticle(found, skill) : missed(skill);
      }
    }
  } catch {
    reply = {
      lead: 'That lookup did not come back.',
      body: 'The connection failed, so I have nothing sourced to give you.',
      close: 'Check the connection and try again.',
      via: 'article',
      retry: true,
    };
  }

  typing.remove();
  thread.messages.push({ role: 'bot', ...reply, at: Date.now() });
  write();
  busy = false;
  setSendDisabled(false);
  renderThread({ stream: reply.via === 'model' });
  renderThreads();
}

function regenerate() {
  const thread = current();
  if (!thread || busy) return;
  const lastUser = [...thread.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;
  // drop the trailing answer, ask again with the same question
  while (thread.messages.length && thread.messages[thread.messages.length - 1].role === 'bot') thread.messages.pop();
  write();
  ask(lastUser.text, { fromRetry: true });
}

/* ── rendering ─────────────────────────────────────────────────────────── */

function renderThreads() {
  const list = $('threads');
  const q = ($('find').value || '').trim().toLowerCase();
  list.innerHTML = '';
  const shown = threads.filter((t) => !q || (t.title || '').toLowerCase().includes(q));
  for (const t of shown) {
    const li = el('li', `thread-item${t.id === activeId ? ' is-open' : ''}`);
    const open = el('button', 'thread-open', `<b>${esc(t.title || 'New chat')}</b><small>${t.messages.length} message${t.messages.length === 1 ? '' : 's'}</small>`);
    open.type = 'button';
    open.addEventListener('click', () => openThread(t.id));
    const del = el('button', 'thread-del', I.trash);
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete conversation');
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteThread(t.id); });
    li.append(open, del);
    list.append(li);
  }
}

function bubbleText(msg) {
  return msg.role === 'user' ? (msg.text || '') : [msg.lead, msg.body, msg.close].filter(Boolean).join('\n\n');
}

function bubbleOf(msg, { last = false, stream = false } = {}) {
  const row = el('div', `row ${msg.role === 'user' ? 'me' : 'bot'}`);
  if (msg.role !== 'user') {
    const av = el('span', 'avatar', I.mark);
    av.setAttribute('aria-hidden', 'true');
    row.append(av);
  }

  const wrap = el('div', 'bubble-wrap');
  const b = el('div', 'bubble');

  if (msg.role === 'user') {
    b.append(el('p', null, esc(msg.text || '')));
  } else {
    if (msg.lead) b.append(el('p', 'lead', esc(msg.lead)));
    const body = el('p', 'body');
    b.append(body);
    if (msg.close) b.append(el('p', 'close', esc(msg.close)));
    if (msg.source) {
      const a = el('a', 'source', `${I.source}<span>${esc(msg.source.title)}</span>`);
      a.href = msg.source.href;
      b.append(a);
    }
    if (msg.retry) {
      const retry = el('button', 'mini-btn', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', () => regenerate());
      b.append(retry);
    }

    // the words, revealed progressively when the model wrote them
    const full = msg.body || '';
    if (stream && !reduced() && full) {
      body.textContent = '';
      const words = full.split(/(\s+)/);
      let i = 0;
      const tick = () => {
        if (i >= words.length) return;
        body.textContent += words.slice(i, i + 3).join('');
        i += 3;
        $('thread').scrollTop = $('thread').scrollHeight;
        setTimeout(tick, 16);
      };
      tick();
    } else {
      body.textContent = full;
    }
  }

  wrap.append(b);

  // meta: provenance, time, actions
  const meta = el('div', 'meta');
  if (msg.role !== 'user') {
    meta.append(el('span', 'via', msg.via === 'model' ? 'model' : 'from the article'));
  }
  meta.append(el('span', 'time', clock(msg.at || Date.now())));
  wrap.append(meta);

  const actions = el('div', 'actions');
  const copy = el('button', 'act', I.copy);
  copy.type = 'button';
  copy.setAttribute('aria-label', 'Copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(bubbleText(msg));
      copy.innerHTML = I.check;
      copy.classList.add('done');
      setTimeout(() => { copy.innerHTML = I.copy; copy.classList.remove('done'); }, 1400);
    } catch { /* blocked */ }
  });
  actions.append(copy);
  if (msg.role !== 'user' && last) {
    const again = el('button', 'act', I.again);
    again.type = 'button';
    again.setAttribute('aria-label', 'Regenerate this answer');
    again.addEventListener('click', () => regenerate());
    actions.append(again);
  }
  if (msg.role !== 'user') wrap.append(actions);

  row.append(wrap);
  return row;
}

const TILES = [
  { icon: I.search, title: 'What is the Unified Payments Interface?', note: 'A direct answer, sourced' },
  { icon: I.book, title: 'Who was Ashoka?', note: 'History, from the article' },
  { icon: I.chart, title: 'How does photosynthesis work?', note: 'Science, step by step' },
  { icon: I.globe, title: 'When did Chandrayaan-3 land?', note: 'Space' },
  { icon: I.spark, title: 'What is a black hole?', note: 'Astronomy' },
];

function renderHello() {
  const box = el('div', 'hello');
  const head = el('div', 'hello-head');
  head.append(el('span', 'avatar', I.mark));
  head.append(el('h2', null, 'Ask Galeoindus anything'));
  head.append(el('p', null, 'A question becomes an answer you can check — with the article attached, or written by the model when it is connected.'));
  box.append(head);
  const bento = el('div', 'bento');
  for (const t of TILES) {
    const b = el('button', 'tile', `<span class="ic">${t.icon}</span><b>${esc(t.title)}</b><small>${esc(t.note)}</small>`);
    b.type = 'button';
    b.addEventListener('click', () => { $('input').value = t.title; $('composer').requestSubmit(); });
    bento.append(b);
  }
  box.append(bento);
  return box;
}

function renderThread({ stream = false } = {}) {
  const thread = current();
  const box = $('thread');
  box.innerHTML = '';
  $('chatTitle').textContent = thread?.title || 'New chat';
  $('chatSub').textContent = thread && thread.messages.length
    ? `${thread.messages.length} message${thread.messages.length === 1 ? '' : 's'} in this conversation`
    : 'Ask in your own words — every answer keeps its source.';

  if (!thread || !thread.messages.length) { box.append(renderHello()); return; }

  let lastDay = '';
  thread.messages.forEach((m, i) => {
    const day = dayOf(m.at || Date.now());
    if (day !== lastDay) {
      box.append(el('div', 'day', `<span>${esc(day)}</span>`));
      lastDay = day;
    }
    box.append(bubbleOf(m, { last: i === thread.messages.length - 1, stream: stream && i === thread.messages.length - 1 }));
  });

  // follow-ups under the newest answer
  const last = thread.messages[thread.messages.length - 1];
  if (last && last.role === 'bot' && !busy) {
    const skill = route([...thread.messages].reverse().find((m) => m.role === 'user')?.text || '');
    const set = FOLLOW_UPS[skill?.mode] || FOLLOW_UPS.default;
    const chips = el('div', 'follow');
    for (const q of set) {
      const c = el('button', 'follow-chip', esc(q));
      c.type = 'button';
      c.addEventListener('click', () => ask(q));
      chips.append(c);
    }
    box.append(chips);
  }

  box.scrollTop = box.scrollHeight;
}

function showTyping() {
  const row = el('div', 'row bot');
  const av = el('span', 'avatar', I.mark);
  av.setAttribute('aria-hidden', 'true');
  const b = el('div', 'bubble', '<span class="typing"><i></i><i></i><i></i></span>');
  row.append(av, b);
  $('thread').append(row);
  $('thread').scrollTop = $('thread').scrollHeight;
  return row;
}

function setSendDisabled(on) {
  const s = $('send');
  if (s) s.disabled = on;
}

/* ── export ────────────────────────────────────────────────────────────── */

function exportThread() {
  const thread = current();
  if (!thread || !thread.messages.length) return;
  const lines = [`# ${thread.title}`, '', `_Galeoindus — ${new Date().toLocaleString()}_`, ''];
  for (const m of thread.messages) {
    if (m.role === 'user') lines.push(`**You:** ${m.text}`, '');
    else {
      if (m.lead) lines.push(`**Galeoindus:** ${m.lead}`, '');
      if (m.body) lines.push(m.body, '');
      if (m.close) lines.push(m.close, '');
      if (m.source) lines.push(`Source: ${location.origin}${m.source.href}`, '');
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(thread.title || 'galeoindus').replace(/[^\w\s-]/g, '').slice(0, 40).trim() || 'chat'}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ── wiring ────────────────────────────────────────────────────────────── */

function applyTheme() {
  document.documentElement.setAttribute('data-theme', prefs.theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', prefs.theme === 'dark' ? '#0a0c12' : '#f4f1fb');
  });
}

function wire() {
  applyTheme();
  $('langPill').textContent = prefs.lang === 'hi' ? 'हिं' : 'EN';

  // an export button beside the language pill
  const top = document.querySelector('.top');
  if (top && !$('exportBtn')) {
    const b = el('button', 'icon-btn', I.down);
    b.id = 'exportBtn';
    b.type = 'button';
    b.setAttribute('aria-label', 'Download this conversation');
    b.title = 'Download as Markdown';
    b.addEventListener('click', exportThread);
    top.insertBefore(b, $('langPill'));
  }

  $('newChat').addEventListener('click', () => newThread());
  $('themeBtn').addEventListener('click', () => {
    prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
    write(); applyTheme();
  });
  $('langPill').addEventListener('click', () => {
    prefs.lang = prefs.lang === 'en' ? 'hi' : 'en';
    write();
    $('langPill').textContent = prefs.lang === 'hi' ? 'हिं' : 'EN';
    $('langPill').title = prefs.lang === 'hi' ? 'हिंदी में उत्तर' : 'Answers in English';
  });
  $('menuBtn').addEventListener('click', () => $('app').classList.toggle('side-open'));
  $('find').addEventListener('input', renderThreads);

  const input = $('input');
  const form = $('composer');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = '';
    input.style.height = 'auto';
    ask(value);
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(190, input.scrollHeight)}px`;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  const thread = $('thread');
  const jump = $('jump');
  thread.addEventListener('scroll', () => {
    jump.hidden = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= 260;
  });
  jump.addEventListener('click', () => { thread.scrollTop = thread.scrollHeight; });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $('micBtn');
  if (SR) {
    mic.addEventListener('click', () => {
      const rec = new SR();
      rec.lang = prefs.lang === 'hi' ? 'hi-IN' : 'en-IN';
      rec.interimResults = false;
      mic.classList.add('is-on');
      rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; input.focus(); };
      rec.onend = () => mic.classList.remove('is-on');
      rec.onerror = () => mic.classList.remove('is-on');
      try { rec.start(); } catch { mic.classList.remove('is-on'); }
    });
  } else {
    mic.disabled = true;
    mic.title = 'Voice is not supported in this browser';
  }

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); newThread(); }
    if (mod && e.key === '/') { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') $('app').classList.remove('side-open');
  });
}

/* ── boot ──────────────────────────────────────────────────────────────── */
read();
if (!threads.length) newThread();
else activeId = threads[0].id;
wire();
renderThreads();
renderThread();
