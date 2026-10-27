/* Galeoindus — the ask page.
 *
 * Wikipedia only. No model, no key, no API behind it: a question is searched
 * against Wikipedia and Wikidata, the matching article is read, and the
 * answer is quoted from it with the source attached. Nothing is generated,
 * so nothing can be invented.
 *
 * Every answer can also be read as Markdown: the same answer broken into its
 * topics, each with the source it came from, plus the trail of where the
 * research was done.
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
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayOf = (ms) => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

const MARK = '<svg viewBox="0 0 40 40"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285f4"/><stop offset=".5" stop-color="#9b72ff"/><stop offset="1" stop-color="#ff5f9e"/></linearGradient></defs><rect width="40" height="40" rx="13" fill="url(#g2)"/><path d="M11.6 12.4h16.8a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4h-7.6L15.4 30.2v-3.8h-3.8a3.4 3.4 0 0 1-3.4-3.4v-7.2a3.4 3.4 0 0 1 3.4-3.4Z" fill="none" stroke="#fff" stroke-width="2.1" stroke-linejoin="round"/><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"><path d="M14.6 17.4c1.8-2.1 3.6-2.1 5.4 0s3.6 2.1 5.4 0"/><path d="M14.6 21.9c1.8-2.1 3.6-2.1 5.4 0s3.6 2.1 5.4 0" stroke-opacity=".72"/></g></svg>';

const I = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
  again: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  md: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v10M3 12l3-3 3 3M21 7v10M21 7l-3.5 4L14 7v10"/></svg>',
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
let pendingMode = '';

function read() {
  try { threads = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(threads)) threads = []; } catch { threads = []; }
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { /* ignore */ }
}
function write() {
  try { localStorage.setItem(KEY, JSON.stringify(threads.slice(0, 40))); localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* ignore */ }
}
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const current = () => threads.find((t) => t.id === activeId) || null;

function newThread() {
  const t = { id: uid(), title: 'New chat', messages: [], at: Date.now() };
  threads.unshift(t); activeId = t.id; write();
  renderThreads(); renderStage(); $('input').focus();
}
function openThread(id) { activeId = id; renderThreads(); renderStage(); $('app').classList.remove('side-open'); }
function deleteThread(id) {
  threads = threads.filter((t) => t.id !== id);
  if (activeId === id) activeId = threads[0]?.id || null;
  write(); renderThreads(); renderStage();
}

/* ── the encyclopedia ──────────────────────────────────────────────────── */
const HOST = (lang) => `${lang}.wikipedia.org`;

async function lookup(lang, query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search',
    gsrsearch: query, gsrlimit: '3', prop: 'extracts|pageimages|info', inprop: 'url',
    exintro: '1', explaintext: '1', exchars: '1400', piprop: 'thumbnail', pithumbsize: '400', redirects: '1',
  });
  const res = await fetch(`https://${HOST(lang)}/w/api.php?${params}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  const pages = data?.query?.pages;
  const list = Array.isArray(pages) ? pages : (pages ? Object.values(pages) : []);
  const ok = list.filter((p) => p && !p.missing && p.extract);
  if (!ok.length) return null;
  const first = ok[0];
  return {
    query,
    lang,
    title: first.title,
    extract: first.extract,
    fullurl: first.fullurl || `https://${HOST(lang)}/wiki/${encodeURIComponent(slug(first.title))}`,
    more: ok.slice(1, 3).map((p) => ({
      title: p.title,
      fullurl: p.fullurl || `https://${HOST(lang)}/wiki/${encodeURIComponent(slug(p.title))}`,
    })),
  };
}

const GREETING = /^(hi|hello|hey|namaste|namaskar|hii|hola|good (morning|evening|afternoon))\b/i;

/* A full stop ends a sentence — unless it belongs to an abbreviation, which is
   why "c. 304 – 232 BCE" must not become its own topic. */
const ABBR = /(?:^|\s)(?:c|ca|approx|e\.g|i\.e|etc|vs|dr|mr|mrs|ms|st|no|vol|pp|p|fig|al|cf|ed|trans)\.$/i;

function sentencesOf(text) {
  const pieces = String(text || '').split(/(?<=[.!?])\s+/);
  const merged = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && ABBR.test(last)) merged[merged.length - 1] = `${last} ${piece}`;
    else merged.push(piece);
  }
  return merged.map((s) => s.trim()).filter((s) => s.length > 30);
}

function articleReply(found, skill) {
  const shape = SHAPE_OF(skill?.mode || 'default');
  return {
    head: found.title,
    lead: shape.lead,
    body: found.extract,
    via: 'article',
    trail: {
      query: found.query,
      host: HOST(found.lang),
      title: found.title,
      fullurl: found.fullurl,
      at: Date.now(),
    },
    sources: [
      { title: found.title, href: `/articles/${slug(found.title)}/`, external: found.fullurl, domain: HOST(found.lang), note: 'The article this answer is quoted from' },
      ...found.more.map((p) => ({ title: p.title, href: `/articles/${slug(p.title)}/`, external: p.fullurl, domain: HOST(found.lang), note: 'Related article' })),
    ],
  };
}

function greeting() {
  return { head: 'Hello', body: 'Ask me about a person, a place, an event or an idea, and I will read the published article and quote it back to you, with the source attached.', via: 'article' };
}
function care() {
  const s = SHAPE_OF('support');
  return { head: 'I am here', lead: s.lead, body: 'I will not guess at how you feel. If there is a fact behind it — a person, a place, something that happened — I can look it up in the sources and show you exactly where it comes from.', via: 'article' };
}
function missed(skill, query, lang) {
  const s = SHAPE_OF(skill?.mode || 'default');
  return {
    head: 'Nothing in the sources',
    lead: s.lead,
    body: `I searched ${HOST(lang)} for “${query}” and found no article to quote, so I will not invent one.`,
    via: 'article',
    retry: true,
    trail: { query, host: HOST(lang), title: '', fullurl: '', at: Date.now() },
  };
}

const FOLLOW = {
  study: ['Give me an example', 'What is the first step?', 'Test me on this'],
  data: ['What would change your mind?', 'How do I measure it?'],
  critique: ['How would you fix it?', 'What is the weakest part?'],
  code: ['Show the patch', 'How do I test it?'],
  default: ['Tell me more', 'Where does that come from?', 'What else is related?'],
};

/* ── ask ───────────────────────────────────────────────────────────────── */
async function ask(text) {
  const value = String(text || '').trim();
  if (!value || busy) return;
  const thread = current() || newThread();
  busy = true; setSend(true);

  thread.messages.push({ role: 'user', text: value, at: Date.now() });
  if (thread.title === 'New chat') thread.title = value.slice(0, 46);
  thread.at = Date.now();
  write(); renderThreads(); renderStage();

  const skill = route(value);
  const thinking = showThinking();
  let reply;

  try {
    if (GREETING.test(value.trim()) && value.trim().split(/\s+/).length <= 4) reply = greeting();
    else if (skill?.mode === 'support') reply = care();
    else {
      const found = await lookup(prefs.lang, value);
      reply = found ? articleReply(found, skill) : missed(skill, value, prefs.lang);
    }
  } catch {
    reply = { head: 'Connection lost', body: 'The search did not come back, so I have nothing sourced to give you.', via: 'article', retry: true };
  }

  thinking.remove();
  thread.messages.push({ role: 'bot', ...reply, at: Date.now() });
  write(); busy = false; setSend(false);
  renderStage();
  renderThreads();
}

function regenerate() {
  const thread = current();
  if (!thread || busy) return;
  const lastUser = [...thread.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;
  while (thread.messages.length && thread.messages[thread.messages.length - 1].role === 'bot') thread.messages.pop();
  write();
  busy = false;
  ask(lastUser.text);
}

/* ── markdown ──────────────────────────────────────────────────────────── */

/** The same answer, as Markdown: topics, each with the source it came from. */
function markdownOf(msg) {
  const out = [];
  out.push(`# ${msg.head || 'Answer'}`);
  out.push('');
  const when = new Date(msg.at || Date.now()).toLocaleString();
  out.push(`> Quoted from ${msg.trail?.host || 'wikipedia.org'} · ${(msg.sources || []).length} source${(msg.sources || []).length === 1 ? '' : 's'} · ${when}`);
  out.push('');

  const points = sentencesOf(msg.body);
  if (msg.lead) { out.push('## Summary'); out.push(''); out.push(msg.lead); out.push(''); }

  if (points.length) {
    out.push('## What the source says');
    out.push('');
    points.forEach((p, i) => {
      const n = Math.min(i + 1, (msg.sources || []).length || 1);
      out.push(`- ${p} [${n}]`);
    });
    out.push('');
  } else if (msg.body) {
    out.push('## What the source says');
    out.push('');
    out.push(msg.body);
    out.push('');
  }

  if (msg.sources?.length) {
    out.push('## Sources');
    out.push('');
    msg.sources.forEach((s, i) => {
      out.push(`${i + 1}. **${s.title}** — ${s.domain || 'indusmova'}`);
      out.push(`   - read here: ${s.href}`);
      if (s.external) out.push(`   - original: ${s.external}`);
    });
    out.push('');
  }

  if (msg.trail) {
    out.push('## Research trail');
    out.push('');
    out.push(`- searched \`${msg.trail.host}\` for “${msg.trail.query}”`);
    if (msg.trail.title) out.push(`- matched the article “${msg.trail.title}”`);
    out.push('- read the article introduction, quoted above word for word');
    out.push('');
  }

  out.push('---');
  out.push('_Galeoindus · indusmova · answers are quoted from published sources, never generated_');
  return out.join('\n');
}

/* ── rendering ─────────────────────────────────────────────────────────── */
function renderThreads() {
  const list = $('threads');
  const q = ($('find').value || '').trim().toLowerCase();
  list.innerHTML = '';
  for (const t of threads.filter((x) => !q || (x.title || '').toLowerCase().includes(q))) {
    const li = el('li', `thread-item${t.id === activeId ? ' is-open' : ''}`);
    const open = el('button', 'thread-open', `<b>${esc(t.title || 'New chat')}</b><small>${t.messages.length} message${t.messages.length === 1 ? '' : 's'}</small>`);
    open.type = 'button'; open.addEventListener('click', () => openThread(t.id));
    const del = el('button', 'thread-del', I.trash);
    del.type = 'button'; del.setAttribute('aria-label', 'Delete conversation');
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteThread(t.id); });
    li.append(open, del); list.append(li);
  }
}

const SUGGEST = [
  { ic: I.search, q: 'What is the Unified Payments Interface?', note: 'A direct answer, sourced' },
  { ic: I.book, q: 'Who was Ashoka?', note: 'History, from the article' },
  { ic: I.chart, q: 'How does photosynthesis work?', note: 'Science, step by step' },
  { ic: I.globe, q: 'When did Chandrayaan-3 land?', note: 'Space' },
  { ic: I.spark, q: 'What is a black hole?', note: 'Astronomy' },
  { ic: I.book, q: 'What are the Vedas?', note: 'Culture' },
];

function renderHero() {
  const box = el('div', 'hero');
  box.append(el('span', 'glyph', MARK));
  box.append(el('h2', null, 'What do you want to <em>understand</em>?'));
  box.append(el('p', null, 'Ask in your own words. The answer is quoted from a published article, and you can open the source it came from.'));
  const grid = el('div', 'suggest');
  for (const s of SUGGEST) {
    const b = el('button', 'sg', `<span class="ic">${s.ic}</span><span><b>${esc(s.q)}</b><small>${esc(s.note)}</small></span>`);
    b.type = 'button';
    b.addEventListener('click', () => { $('input').value = s.q; $('composer').requestSubmit(); });
    grid.append(b);
  }
  box.append(grid);
  return box;
}

function citations(text, sources) {
  if (!sources?.length) return esc(text);
  let n = 0;
  return esc(text).replace(/\.\s/g, (m) => {
    n += 1;
    if (n > 4 || n > sources.length) return m;
    const s = sources[n - 1];
    return `.<a class="cite" href="${esc(s.href)}" title="${esc(s.title)}">${n}</a> `;
  });
}

function answerOf(msg, { last = false } = {}) {
  const card = el('article', 'answer');
  const head = el('div', 'answer-head');
  head.append(el('span', 'glyph', MARK));
  head.append(el('b', null, 'Galeoindus'));
  head.append(el('span', 'via', 'from the article'));
  head.append(el('span', 'when', clock(msg.at || Date.now())));
  card.append(head);

  if (msg.head) card.append(el('h3', null, esc(msg.head)));
  if (msg.lead) card.append(el('p', 'answer-body', `<strong>${esc(msg.lead)}</strong>`));

  const body = el('div', 'answer-body');
  body.innerHTML = citations(msg.body || '', msg.sources);
  card.append(body);

  if (msg.sources?.length) {
    const src = el('div', 'sources');
    src.append(el('div', 'label', `${msg.sources.length} source${msg.sources.length === 1 ? '' : 's'}`));
    const grid = el('div', 'src-grid');
    for (const s of msg.sources.slice(0, 4)) {
      const a = el('a', 'src', `<span class="dom"><i></i>${esc(s.domain || 'indusmova')}</span><b>${esc(s.title)}</b><small>${esc(s.note || '')}</small>`);
      a.href = s.href;
      grid.append(a);
    }
    src.append(grid);
    card.append(src);
  }

  // the markdown view, built on demand
  const mdBox = el('pre', 'md');
  mdBox.hidden = true;

  const foot = el('div', 'answer-foot');
  const copy = el('button', 'act', I.copy);
  copy.type = 'button'; copy.setAttribute('aria-label', 'Copy this answer');
  copy.addEventListener('click', async () => {
    const text = mdBox.hidden ? [msg.head, msg.lead, msg.body].filter(Boolean).join('\n\n') : mdBox.textContent;
    try { await navigator.clipboard.writeText(text); copy.innerHTML = I.check; copy.classList.add('done'); setTimeout(() => { copy.innerHTML = I.copy; copy.classList.remove('done'); }, 1400); } catch { /* blocked */ }
  });
  foot.append(copy);

  if (msg.body) {
    const md = el('button', 'act', I.md);
    md.type = 'button';
    md.setAttribute('aria-label', 'Read as Markdown with sources');
    md.title = 'Markdown: topics and sources';
    md.addEventListener('click', () => {
      mdBox.textContent = markdownOf(msg);
      mdBox.hidden = !mdBox.hidden;
      md.classList.toggle('done', !mdBox.hidden);
      if (!mdBox.isConnected) card.insertBefore(mdBox, foot);
      if (!mdBox.hidden) mdBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    foot.append(md);
  }

  if (last) {
    const again = el('button', 'act', I.again);
    again.type = 'button'; again.setAttribute('aria-label', 'Ask again');
    again.addEventListener('click', () => regenerate());
    foot.append(again);
  }
  if (msg.retry) {
    const r = el('button', 'chip', 'Try again');
    r.type = 'button'; r.addEventListener('click', () => regenerate());
    foot.append(r);
  }
  foot.append(el('span', 'spacer'));
  card.append(foot);
  return card;
}

function renderStage() {
  const thread = current();
  const stage = $('stage');
  stage.innerHTML = '';
  $('chatTitle').textContent = thread?.title || 'New chat';
  $('chatSub').textContent = thread?.messages.length
    ? `${thread.messages.length} message${thread.messages.length === 1 ? '' : 's'} in this conversation`
    : 'Ask in your own words — the answer comes with its source.';

  if (!thread || !thread.messages.length) { stage.append(renderHero()); return; }

  let lastDay = '';
  thread.messages.forEach((m, i) => {
    const day = dayOf(m.at || Date.now());
    if (day !== lastDay) { stage.append(el('div', 'day', `<span>${esc(day)}</span>`)); lastDay = day; }
    if (m.role === 'user') {
      const row = el('div', 'ask-row');
      row.append(el('div', 'ask-pill', esc(m.text || '')));
      stage.append(row);
    } else {
      stage.append(answerOf(m, { last: i === thread.messages.length - 1 }));
    }
  });

  const last = thread.messages[thread.messages.length - 1];
  if (last && last.role === 'bot' && !busy) {
    const skill = route([...thread.messages].reverse().find((m) => m.role === 'user')?.text || '');
    const chips = el('div', 'follow');
    for (const q of (FOLLOW[skill?.mode] || FOLLOW.default)) {
      const c = el('button', 'chip', esc(q));
      c.type = 'button'; c.addEventListener('click', () => ask(q));
      chips.append(c);
    }
    stage.append(chips);
  }
  stage.scrollTop = stage.scrollHeight;
}

function showThinking() {
  const card = el('article', 'answer');
  card.append(el('div', 'answer-head', `<span class="glyph">${MARK}</span><b>Galeoindus</b><span class="via">searching</span>`));
  card.append(el('div', 'thinking', '<i></i><i></i><i></i><span>Reading the article…</span>'));
  $('stage').append(card);
  $('stage').scrollTop = $('stage').scrollHeight;
  return card;
}

function setSend(on) { const s = $('send'); if (s) s.disabled = on; }

function exportThread() {
  const t = current();
  if (!t || !t.messages.length) return;
  const lines = [`# ${t.title}`, '', `_Galeoindus — ${new Date().toLocaleString()}_`, ''];
  for (const m of t.messages) {
    if (m.role === 'user') lines.push(`**You:** ${m.text}`, '');
    else lines.push(markdownOf(m), '');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(t.title || 'galeoindus').replace(/[^\w\s-]/g, '').slice(0, 40).trim() || 'chat'}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ── wiring ────────────────────────────────────────────────────────────── */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', prefs.theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', prefs.theme === 'dark' ? '#0b0d13' : '#fbfaff'));
}

function wire() {
  applyTheme();
  $('langPill').textContent = prefs.lang === 'hi' ? 'हिं' : 'EN';
  $('newChat').addEventListener('click', newThread);
  $('exportBtn').addEventListener('click', exportThread);
  $('themeBtn').addEventListener('click', () => { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; write(); applyTheme(); });
  $('langPill').addEventListener('click', () => {
    prefs.lang = prefs.lang === 'en' ? 'hi' : 'en'; write();
    $('langPill').textContent = prefs.lang === 'hi' ? 'हिं' : 'EN';
    $('langPill').title = prefs.lang === 'hi' ? 'हिंदी में उत्तर' : 'Answers in English';
  });
  $('menuBtn').addEventListener('click', () => $('app').classList.toggle('side-open'));
  $('find').addEventListener('input', renderThreads);

  document.querySelectorAll('.mode').forEach((b) => {
    b.addEventListener('click', () => {
      pendingMode = b.dataset.mode || '';
      document.querySelectorAll('.mode').forEach((x) => x.classList.remove('on'));
      if (pendingMode) b.classList.add('on');
      $('input').focus();
    });
  });

  const input = $('input');
  const form = $('composer');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    const text = pendingMode ? `${pendingMode}: ${raw}` : raw;
    input.value = ''; input.style.height = 'auto';
    ask(text);
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(180, input.scrollHeight)}px`; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  const stage = $('stage');
  const jump = $('jump');
  stage.addEventListener('scroll', () => { jump.hidden = stage.scrollHeight - stage.scrollTop - stage.clientHeight <= 240; });
  jump.addEventListener('click', () => { stage.scrollTop = stage.scrollHeight; });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $('micBtn');
  if (SR) {
    mic.addEventListener('click', () => {
      const rec = new SR();
      rec.lang = prefs.lang === 'hi' ? 'hi-IN' : 'en-IN';
      mic.classList.add('is-on');
      rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; input.focus(); };
      rec.onend = () => mic.classList.remove('is-on');
      rec.onerror = () => mic.classList.remove('is-on');
      try { rec.start(); } catch { mic.classList.remove('is-on'); }
    });
  } else { mic.disabled = true; mic.title = 'Voice is not supported in this browser'; }

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
renderStage();
