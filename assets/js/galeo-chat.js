/* Galeoindus — the ask page.
 *
 * Wikipedia only. A question is searched against Wikipedia, the matching
 * article is read, and the answer is quoted from it with the source attached.
 * Nothing is generated, so nothing can be invented.
 *
 * A follow-up — "tell me more", "what is the weakest part" — is asked about
 * the article already open, not searched as a fresh sentence. Searching the
 * follow-up literally is what once answered a question about UPI with the
 * British game show The Weakest Link.
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

const MARK = '<svg viewBox="0 0 40 40"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d98a5f"/><stop offset=".55" stop-color="#c96f8f"/><stop offset="1" stop-color="#8d7ae0"/></linearGradient></defs><rect width="40" height="40" rx="14" fill="url(#g2)"/><path d="M11.6 12.4h16.8a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4h-7.6L15.4 30.2v-3.8h-3.8a3.4 3.4 0 0 1-3.4-3.4v-7.2a3.4 3.4 0 0 1 3.4-3.4Z" fill="none" stroke="#fff" stroke-width="2.1" stroke-linejoin="round"/><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"><path d="M14.6 17.4c1.8-2.1 3.6-2.1 5.4 0s3.6 2.1 5.4 0"/><path d="M14.6 21.9c1.8-2.1 3.6-2.1 5.4 0s3.6 2.1 5.4 0" stroke-opacity=".72"/></g></svg>';

const I = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
  again: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
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

/** Create a thread and hand it back — the missing return here is what made
 *  every message after a delete fail and left the send button locked. */
function newThread() {
  const t = { id: uid(), title: 'New chat', messages: [], topic: '', at: Date.now() };
  threads.unshift(t);
  activeId = t.id;
  write();
  renderThreads();
  renderStage();
  $('input')?.focus();
  return t;
}

function openThread(id) { activeId = id; renderThreads(); renderStage(); $('app').classList.remove('side-open'); }
function deleteThread(id) {
  threads = threads.filter((t) => t.id !== id);
  activeId = threads[0]?.id || null;
  busy = false; setSend(false);
  write();
  if (!threads.length) newThread(); else { renderThreads(); renderStage(); }
}

/* ── the encyclopedia ──────────────────────────────────────────────────── */
const HOST = (lang) => `${lang}.wikipedia.org`;

async function query(lang, params) {
  const url = `https://${HOST(lang)}/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  const pages = data?.query?.pages;
  return Array.isArray(pages) ? pages : (pages ? Object.values(pages) : []);
}

async function search(lang, text, chars = 2600) {
  const pages = await query(lang, {
    generator: 'search', gsrsearch: text, gsrlimit: '3',
    prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1',
    exchars: String(chars), redirects: '1',
  });
  const ok = pages.filter((p) => p && !p.missing && p.extract);
  if (!ok.length) return null;
  const first = ok[0];
  return {
    query: text, lang, title: first.title, extract: first.extract,
    fullurl: first.fullurl || `https://${HOST(lang)}/wiki/${encodeURIComponent(slug(first.title))}`,
    more: ok.slice(1, 3).map((p) => ({ title: p.title, fullurl: p.fullurl || `https://${HOST(lang)}/wiki/${encodeURIComponent(slug(p.title))}` })),
  };
}

/** The rest of an article already open — used for a follow-up. */
async function fullArticle(lang, title) {
  const pages = await query(lang, {
    titles: title, prop: 'extracts|info', inprop: 'url', explaintext: '1',
    exchars: '3000', redirects: '1',
  });
  const p = pages.find((x) => x && !x.missing && x.extract);
  if (!p) return null;
  return { title: p.title, extract: p.extract, fullurl: p.fullurl || `https://${HOST(lang)}/wiki/${encodeURIComponent(slug(p.title))}` };
}

const GREETING = /^(hi|hello|hey|namaste|namaskar|hii|hola|good (morning|evening|afternoon))\b/i;
const FOLLOW_UP = /^(tell me more|where does that come from|what else is related|give me an example|what is the first step|test me on this|how would you fix it|what is the weakest part|show the patch|how do i test it|what would change your mind|how do i measure it|why|how so|and\b|what about|more\b|explain that|go on)/i;

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

function sourcesOf(found) {
  return [
    { title: found.title, href: `/articles/${slug(found.title)}/`, external: found.fullurl, domain: HOST(found.lang || prefs.lang), note: 'The article this answer is quoted from' },
    ...(found.more || []).map((p) => ({ title: p.title, href: `/articles/${slug(p.title)}/`, external: p.fullurl, domain: HOST(found.lang || prefs.lang), note: 'Related article' })),
  ];
}

/* An AI-style answer is not a wall of text: it opens with the direct answer,
   then the few points that carry it, then the rest. All of it is still the
   article's own sentences — chosen and ordered, never rewritten. */
const WHEN_Q = /\b(when|what year|which year|how old|in what year|date)\b/i;
const NUM_Q = /\b(how many|how much|how long|population|cost|price|number of|largest|biggest)\b/i;
const HOW_Q = /\b(how does|how do|how did|how is|how are|process|works|work)\b/i;

function composeAnswer(extract, question) {
  const sents = sentencesOf(extract);
  if (!sents.length) return { answer: String(extract || '').trim(), points: [], rest: '' };

  const q = String(question || '');
  // the direct answer: the opening sentence, plus the second if the first is short
  let take = 1;
  if (sents[0].length < 130 && sents[1]) take = 2;
  const answer = sents.slice(0, take).join(' ');

  const score = (text, index) => {
    let n = 0;
    if (WHEN_Q.test(q) && /\b(1[0-9]{3}|20[0-9]{2})\b/.test(text)) n += 3;
    if (NUM_Q.test(q) && /\d/.test(text)) n += 2;
    if (HOW_Q.test(q) && /(by|through|using|process|begins|works|allows|enables)/i.test(text)) n += 2;
    if (/\b(is|was|are|were|has|had)\b/.test(text)) n += 1;
    n += Math.min(2, text.length / 180);
    return n - index * 0.01;                 // earlier sentences win ties
  };

  const rest = sents.slice(take).map((text, i) => ({ text, i: i + take }));
  const ranked = [...rest].sort((a, b) => score(b.text, b.i) - score(a.text, a.i));
  let points = ranked.slice(0, 4).map((x) => x.text).filter((t) => t.length > 30);
  if (points.length < 2) {
    // a short article: accept the shorter sentences too, rather than one bullet
    points = rest.map((x) => x.text).filter((t) => t.length > 18).slice(0, 3);
  }

  const used = new Set(points);
  const tail = rest.map((x) => x.text).filter((t) => !used.has(t)).join(' ');

  return { answer, points, rest: tail.slice(0, 1200) };
}

function articleReply(found, skill, { about = '', question = '' } = {}) {
  const parts = composeAnswer(found.extract, question || found.query || found.title);
  return {
    head: found.title,
    about,
    answer: parts.answer,
    points: parts.points,
    body: parts.rest,
    via: 'article',
    trail: { query: found.query || found.title, host: HOST(found.lang || prefs.lang), title: found.title, fullurl: found.fullurl, at: Date.now() },
    sources: sourcesOf(found),
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

  let thread = current();
  if (!thread) thread = newThread();
  if (!thread) return;

  busy = true; setSend(true);
  try {
    thread.messages.push({ role: 'user', text: value, at: Date.now() });
    if (thread.title === 'New chat') thread.title = value.slice(0, 46);
    thread.at = Date.now();
    write(); renderThreads(); renderStage();

    const skill = route(value);
    const isFollow = FOLLOW_UP.test(value) || (thread.topic && value.split(/\s+/).length <= 3);
    const thinking = showThinking();
    let reply;

    try {
      if (GREETING.test(value) && value.split(/\s+/).length <= 4) reply = { head: 'Hello', body: 'Ask me about a person, a place, an event or an idea, and I will read the published article and quote it back to you, with the source attached.', via: 'article' };
      else if (skill?.mode === 'support') { const s = SHAPE_OF('support'); reply = { head: 'I am here', lead: s.lead, body: 'I will not guess at how you feel. If there is a fact behind it, I can look it up in the sources and show you where it comes from.', via: 'article' }; }
      else if (isFollow && thread.topic) {
        // the follow-up belongs to the article already open
        const deeper = await fullArticle(prefs.lang, thread.topic);
        if (deeper) {
          const key = value.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4);
          const lines = sentencesOf(deeper.extract);
          const hits = lines.filter((s) => key.some((w) => s.toLowerCase().includes(w))).slice(0, 3);
          const fuParts = composeAnswer(hits.length ? hits.join(' ') : deeper.extract, value);
          reply = {
            head: deeper.title,
            answer: fuParts.answer,
            points: fuParts.points,
            body: fuParts.rest,
            about: hits.length
              ? 'These are the lines in it closest to your question.'
              : 'The article does not address that directly, so here is the rest of what it does say. I will not make up an answer it does not contain.',
            body: (hits.length ? hits.join(' ') : deeper.extract).slice(0, 1400),
            via: 'article',
            trail: { query: `${thread.topic} · follow-up: ${value}`, host: HOST(prefs.lang), title: deeper.title, fullurl: deeper.fullurl, at: Date.now() },
            sources: sourcesOf({ title: deeper.title, lang: prefs.lang, fullurl: deeper.fullurl, more: [] }),
          };
        }
      }

      if (!reply) {
        const found = await search(prefs.lang, value);
        if (found) { thread.topic = found.title; reply = articleReply(found, skill, { question: value }); }
        else {
          const s = SHAPE_OF(skill?.mode || 'default');
          reply = { head: 'Nothing in the sources', lead: s.lead, body: `I searched ${HOST(prefs.lang)} for “${value}” and found no article to quote, so I will not invent one.`, via: 'article', retry: true, trail: { query: value, host: HOST(prefs.lang), title: '', fullurl: '', at: Date.now() } };
        }
      }
    } catch {
      reply = { head: 'Connection lost', body: 'The search did not come back, so I have nothing sourced to give you.', via: 'article', retry: true };
    }

    thinking.remove();
    thread.messages.push({ role: 'bot', ...reply, at: Date.now() });
    write();
  } finally {
    busy = false;
    setSend(false);
  }
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
function markdownOf(msg) {
  const out = [];
  out.push(`# ${msg.head || 'Answer'}`);
  out.push('');
  const when = new Date(msg.at || Date.now()).toLocaleString();
  out.push(`> Quoted from ${msg.trail?.host || 'wikipedia.org'} · ${(msg.sources || []).length} source${(msg.sources || []).length === 1 ? '' : 's'} · ${when}`);
  out.push('');
  if (msg.about) { out.push('_' + msg.about + '_'); out.push(''); }

  if (msg.answer) { out.push('## Answer'); out.push(''); out.push(msg.answer); out.push(''); }

  const points = msg.points || [];
  if (points.length) {
    out.push('## Key points');
    out.push('');
    points.forEach((p, i) => out.push(`- ${p} [${Math.min(i + 1, (msg.sources || []).length || 1)}]`));
    out.push('');
  }

  if (msg.body) {
    out.push('## More from the article');
    out.push('');
    sentencesOf(msg.body).forEach((p, i) => out.push(`- ${p} [${Math.min(i + 1, (msg.sources || []).length || 1)}]`));
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
    out.push('- read the article, quoted above word for word');
    out.push('');
  }
  out.push('---');
  out.push('_Galeoindus · indusmova · quoted from published sources, never generated_');
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
  if (msg.about) card.append(el('p', 'answer-note', esc(msg.about)));

  // the direct answer first
  if (msg.answer) card.append(el('p', 'answer-lead', esc(msg.answer)));

  // then the few points that carry it
  if (msg.points && msg.points.length) {
    const list = el('div', 'answer-points');
    msg.points.forEach((pt) => list.append(el('p', 'answer-point', '• ' + esc(pt))));
    card.append(list);
  }

  // then the rest of what the article says
  if (msg.body) {
    const body = el('div', 'answer-body');
    body.innerHTML = citations(msg.body, msg.sources);
    card.append(body);
  }

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

  const mdBox = el('pre', 'md');
  mdBox.hidden = true;

  const foot = el('div', 'answer-foot');
  const copy = el('button', 'act', I.copy);
  copy.type = 'button'; copy.setAttribute('aria-label', 'Copy this answer');
  copy.addEventListener('click', async () => {
    const text = mdBox.hidden ? [msg.head, msg.answer, ...(msg.points || []), msg.body].filter(Boolean).join('\n\n') : mdBox.textContent;
    try { await navigator.clipboard.writeText(text); copy.innerHTML = I.check; copy.classList.add('done'); setTimeout(() => { copy.innerHTML = I.copy; copy.classList.remove('done'); }, 1400); } catch { /* blocked */ }
  });
  foot.append(copy);

  // the Markdown view, as a labelled button so it can be found
  if (msg.answer || (msg.points || []).length || msg.body) {
    const md = el('button', 'md-btn', 'Markdown');
    md.type = 'button';
    md.title = 'The same answer, broken into topics, with its sources and the research trail';
    md.addEventListener('click', () => {
      mdBox.textContent = markdownOf(msg);
      mdBox.hidden = !mdBox.hidden;
      md.classList.toggle('on', !mdBox.hidden);
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
  card.append(el('div', 'answer-head', `<span class="glyph">${MARK}</span><b>Galeoindus</b><span class="via">reading</span>`));
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
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', prefs.theme === 'dark' ? '#171310' : '#f3ece2'));
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
