/* Galeoindus — the chat page.
 *
 * One module: threads in localStorage, a composer, and an answer engine
 * that reads Wikipedia and Wikidata in the reader's language and keeps the
 * article attached. The Amigo pack (./galeo-skills.js) decides how a reply
 * is shaped; it is never shown as a list.
 *
 * There is no model and no key here: every sentence in an answer is quoted
 * from the published article, so nothing is invented.
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

/* ── icons ─────────────────────────────────────────────────────────────── */
const I = {
  mark: '<svg viewBox="0 0 40 40"><defs><linearGradient id="av" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f9e"/><stop offset="1" stop-color="#7b6bff"/></linearGradient></defs><rect width="40" height="40" rx="13" fill="url(#av)"/><path d="M11.6 12.4h16.8a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4h-7.6L15.4 30.2v-3.8h-3.8a3.4 3.4 0 0 1-3.4-3.4v-7.2a3.4 3.4 0 0 1 3.4-3.4Z" fill="none" stroke="#fff" stroke-width="2.1" stroke-linejoin="round"/><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"><path d="M14.6 17.4c1.8-2.1 3.6-2.1 5.4 0s3.6 2.1 5.4 0"/><path d="M14.6 21.9c1.8-2.1 3.6-2.1 5.4 0s3.6 2.1 5.4 0" stroke-opacity=".72"/></g></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
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
  } catch { /* private mode: the chat still works for this session */ }
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

/* ── the engine ────────────────────────────────────────────────────────── */

const WIKI = (lang) => `https://${lang}.wikipedia.org/w/api.php`;

async function lookup(lang, query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search',
    gsrsearch: query, gsrlimit: '1', prop: 'extracts|pageimages', exintro: '1',
    explaintext: '1', exchars: '900', piprop: 'thumbnail', pithumbsize: '360',
    redirects: '1',
  });
  const res = await fetch(`${WIKI(lang)}?${params}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const data = await res.json();
  // formatversion=2 gives an array; an older shape gives an object keyed by
  // page id. Accept both, or the lookup silently finds nothing.
  const pages = data?.query?.pages;
  const page = Array.isArray(pages) ? pages[0] : (pages ? Object.values(pages)[0] : null);
  if (!page || page.missing || !page.extract) return null;
  return {
    title: page.title,
    extract: page.extract,
    thumb: page.thumbnail?.source || '',
  };
}

const GREETING = /^(hi|hello|hey|namaste|namaskar|hii|hola|salaam|good (morning|evening|afternoon))\b/i;

function compose(text, found, skill) {
  const shape = SHAPE_OF(skill?.mode || 'default');

  if (GREETING.test(text.trim()) && text.trim().split(/\s+/).length <= 4) {
    return {
      lead: 'Hello.',
      body: 'Ask me about a person, a place, an event or an idea, and I will bring back what the published sources say, with the article attached so you can check it.',
      close: 'You can also just think out loud — I will keep up.',
    };
  }

  if (skill?.mode === 'support') {
    return {
      lead: shape.lead,
      body: 'I am here to help you think it through, and I will not guess at how you feel. If there is a fact behind it — a person, a place, something that happened — I can look that up properly and show you where it comes from.',
      close: shape.close,
    };
  }

  if (found) {
    return {
      lead: shape.lead,
      body: found.extract,
      close: shape.close,
      source: { title: found.title, href: `/articles/${slug(found.title)}/` },
    };
  }

  const hint = skill ? `This looks like a ${skill.title.toLowerCase()} question. ` : '';
  return {
    lead: shape.lead,
    body: `${hint}I could not find a published article for that, and I would rather say so than make something up.`,
    close: 'Try a name, a place, an event or a thing, and I will pull the article and keep its source attached.',
  };
}

async function ask(text) {
  const value = String(text || '').trim();
  if (!value || busy) return;
  const thread = current() || newThread();
  busy = true;

  thread.messages.push({ role: 'user', text: value, at: Date.now() });
  if (thread.title === 'New chat') thread.title = value.slice(0, 46);
  thread.at = Date.now();
  write();
  renderThreads();
  renderThread();

  const skill = route(value);
  const typing = showTyping();

  let reply;
  try {
    const found = skill?.mode === 'support' ? null : await lookup(prefs.lang, value);
    reply = compose(value, found, skill);
  } catch {
    reply = {
      lead: 'That lookup did not come back.',
      body: 'The connection to the encyclopedia failed, so I have nothing sourced to give you.',
      close: 'Check the connection and ask me again.',
    };
  }

  typing.remove();
  thread.messages.push({ role: 'bot', ...reply, at: Date.now() });
  write();
  busy = false;
  renderThread();
  renderThreads();
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

function bubbleOf(msg) {
  const row = el('div', `row ${msg.role === 'user' ? 'me' : 'bot'}`);
  if (msg.role !== 'user') {
    const av = el('span', 'avatar', I.mark);
    av.setAttribute('aria-hidden', 'true');
    row.append(av);
  }
  const b = el('div', 'bubble');
  if (msg.role === 'user') {
    // your own words live in `text`; the answer lives in lead/body/close
    b.append(el('p', null, esc(msg.text || '')));
  } else {
    if (msg.lead) b.append(el('p', 'lead', esc(msg.lead)));
    if (msg.body) b.append(el('p', null, esc(msg.body)));
    if (msg.close) b.append(el('p', 'close', esc(msg.close)));
  }
  if (msg.source) {
    const a = el('a', 'source', `${I.source}<span>${esc(msg.source.title)}</span>`);
    a.href = msg.source.href;
    b.append(a);
  }
  if (msg.role !== 'user') {
    const copy = el('button', 'copy', I.copy);
    copy.type = 'button';
    copy.setAttribute('aria-label', 'Copy this answer');
    copy.addEventListener('click', async () => {
      const text = msg.role === 'user' ? (msg.text || '') : [msg.lead, msg.body, msg.close].filter(Boolean).join('\n\n');
      try { await navigator.clipboard.writeText(text); copy.innerHTML = I.check; copy.classList.add('is-done'); }
      catch { /* clipboard blocked */ }
    });
    b.append(copy);
  }
  row.append(b);
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
  head.append(el('p', null, 'A question becomes a source-linked answer from Wikipedia and Wikidata — and every answer keeps the article it came from.'));
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

function renderThread() {
  const thread = current();
  const box = $('thread');
  box.innerHTML = '';
  $('chatTitle').textContent = thread?.title || 'New chat';
  $('chatSub').textContent = thread && thread.messages.length
    ? `${thread.messages.length} message${thread.messages.length === 1 ? '' : 's'} in this conversation`
    : 'Ask in your own words — every answer keeps its source.';

  if (!thread || !thread.messages.length) {
    box.append(renderHello());
    return;
  }
  for (const m of thread.messages) box.append(bubbleOf(m));
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

  $('newChat').addEventListener('click', () => newThread());

  $('themeBtn').addEventListener('click', () => {
    prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
    write();
    applyTheme();
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

  // scroll-to-newest
  const thread = $('thread');
  const jump = $('jump');
  thread.addEventListener('scroll', () => {
    const far = thread.scrollHeight - thread.scrollTop - thread.clientHeight > 260;
    jump.hidden = !far;
  });
  jump.addEventListener('click', () => { thread.scrollTop = thread.scrollHeight; });

  // voice
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

  // shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newThread(); }
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
