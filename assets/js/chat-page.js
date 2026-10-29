/*
 * indusmova · chat
 *
 * One page, one conversation. The question goes out, the passages come back,
 * and the answer is written from them — by the Workers AI binding when it is
 * live, by the entry itself when it is not. Either way the answer names its
 * source and links it, so nothing here is a claim without a place to check.
 */

const ICON = {
  mark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.6a8.4 8.4 0 0 1-9 8.4 9.2 9.2 0 0 1-3.4-.7L3 21l1.6-4.6A8.2 8.2 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.6Z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 20 4l-4.5 16-4-6.5L4 12Z"/></svg>',
};

const SUGGEST = [
  'What is the Unified Payments Interface?',
  'Who was Ashoka?',
  'How does photosynthesis work?',
  'When did Chandrayaan-3 land?',
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const clean = (v, max = 4000) => String(v ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/\[\s*(edit|edit source|citation needed)\s*\]/gi, ' ')
  .replace(/\[\s*\d+[a-z]?\s*\]/g, ' ')
  .replace(/&#91;\s*\d+[a-z]?\s*&#93;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const ABBR = /(?:^|\s)(?:c|ca|approx|e\.g|i\.e|etc|vs|dr|mr|mrs|ms|st|no|vol|pp|p|fig|al)\.$/i;
function sentences(text) {
  const pieces = String(text || '').split(/(?<=[.!?])\s+/);
  const merged = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && ABBR.test(last)) merged[merged.length - 1] = `${last} ${piece}`;
    else merged.push(piece);
  }
  return merged.map((x) => x.trim()).filter((x) => x.length > 30);
}

const API = (lang) => `https://${lang}.wikipedia.org/w/api.php`;
const SKIP = /^(references|see also|notes|citations|footnotes|further reading|external links|bibliography|sources|works cited|gallery|explanatory notes|general sources)$/i;

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchEntries(query, lang = 'en', limit = 3) {
  const url = new URL(API(lang));
  Object.entries({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: query, gsrlimit: String(limit),
    prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1',
    exchars: '1200', redirects: '1',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const data = await getJson(url.href);
  const pages = data?.query?.pages;
  const list = Array.isArray(pages) ? pages : (pages ? Object.values(pages) : []);
  return list.filter((p) => p && !p.missing && p.extract).map((p) => ({
    title: p.title,
    extract: clean(p.extract),
    url: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`,
  }));
}

function textOf(html) {
  return clean(String(html || '')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' '));
}

async function entryTopics(lang, title) {
  const base = { action: 'parse', format: 'json', formatversion: '2', origin: '*', page: title };
  const listUrl = new URL(API(lang));
  Object.entries({ ...base, prop: 'sections' }).forEach(([k, v]) => listUrl.searchParams.set(k, v));
  const listData = await getJson(listUrl.href);
  const sections = (listData?.parse?.sections || [])
    .filter((s) => s.line && !SKIP.test(s.line) && !/^\d+$/.test(s.line))
    .slice(0, 4);

  const out = [];
  for (const sec of sections) {
    try {
      const u = new URL(API(lang));
      Object.entries({ ...base, prop: 'text', section: sec.index }).forEach(([k, v]) => u.searchParams.set(k, v));
      const d = await getJson(u.href);
      const text = textOf(d?.parse?.text);
      const parts = sentences(text);
      if (parts.length) out.push({ heading: clean(sec.line, 80), line: clean(parts[0], 230) });
      else if (text) out.push({ heading: clean(sec.line, 80), line: clean(text, 230) });
    } catch { /* skip */ }
  }
  return out;
}

const WHEN = /\b(when|what year|which year|date|how old)\b/i;
const NUM = /\b(how many|how much|how long|population|cost|number of|total)\b/i;
const HOW = /\b(how does|how do|how did|how is|process|works)\b/i;

function compose(entry, question, topics) {
  const opening = sentences(entry.extract);
  let answer = opening[0] || clean(entry.extract, 400);
  let used = 1;
  if (answer.length < 140 && opening[1]) { answer = `${opening[0]} ${opening[1]}`; used = 2; }

  const rank = (t, i) => {
    let n = 0;
    if (WHEN.test(question) && /\b(1[0-9]{3}|20[0-9]{2})\b/.test(t)) n += 3;
    if (NUM.test(question) && /\d/.test(t)) n += 2;
    if (HOW.test(question) && /(by|through|using|process|works|allows)/i.test(t)) n += 2;
    if (/\b(is|was|are|were|has|had)\b/.test(t)) n += 1;
    return n - i * 0.01;
  };
  const points = opening.slice(used)
    .map((t, i) => ({ t, s: rank(t, i) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => x.t);

  return { title: entry.title, answer, points, topics, url: entry.url };
}

async function askModel(question, passages) {
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, passages: passages.map((p) => ({ title: p.title, text: p.extract })) }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return clean(data?.answer, 3000) || null;
  } catch { return null; }
}

/* ── the page ───────────────────────────────────────────────────────────── */
const thread = document.getElementById('thread');
const form = document.getElementById('composer');
const input = document.getElementById('prompt');
const send = document.getElementById('send');

let busy = false;
let topic = '';
let lastQuestion = '';

function hello() {
  thread.innerHTML = '';
  const box = el('div', 'hello');
  box.append(el('h1', null, 'What do you want to <em>understand</em>?'));
  box.append(el('p', null, 'Ask in your own words. The answer is taken from the entry itself, with the source attached.'));
  const grid = el('div', 'sugg');
  for (const s of SUGGEST) {
    const b = el('button', null, esc(s));
    b.type = 'button';
    b.addEventListener('click', () => ask(s));
    grid.append(b);
  }
  box.append(grid);
  thread.append(box);
}

function steps() {
  const card = el('div', 'answer');
  const list = el('ol', 'steps');
  const items = ['Reading your question', 'Finding the entry', 'Writing the answer'].map((text, i) => {
    const li = el('li', `step${i === 0 ? ' on' : ''}`);
    li.append(el('span', 'dot'));
    li.append(el('span', null, text));
    list.append(li);
    return li;
  });
  card.append(list);
  thread.append(card);
  card.scrollIntoView({ block: 'nearest' });

  let at = 0;
  card._advance = (to) => {
    while (at < to && at < items.length) {
      items[at].classList.remove('on');
      items[at].classList.add('done');
      at += 1;
      if (items[at]) items[at].classList.add('on');
    }
  };
  return card;
}

function render(a) {
  const card = el('article', 'answer');
  card.append(el('p', 'from', `Answer from <b>${esc(a.title)}</b>`));
  card.append(el('h2', null, esc(a.title)));
  if (a.answer) card.append(el('p', 'lead', esc(a.answer)));

  if (a.points?.length) {
    const ul = el('ul', 'points');
    a.points.forEach((p) => ul.append(el('li', null, esc(p))));
    card.append(ul);
  }
  if (a.topics?.length) {
    const box = el('div', 'topics');
    a.topics.forEach((t) => {
      const sec = el('section');
      sec.append(el('h3', null, esc(t.heading)));
      sec.append(el('p', null, esc(t.line)));
      box.append(sec);
    });
    card.append(box);
  }

  const foot = el('div', 'foot');
  const copy = el('button', null, 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    const text = [a.title, a.answer, ...(a.points || []), ...(a.topics || []).map((t) => `${t.heading}: ${t.line}`)].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1400); } catch { /* blocked */ }
  });
  foot.append(copy);

  const again = el('button', null, 'Ask again');
  again.type = 'button';
  again.addEventListener('click', () => { if (lastQuestion) ask(lastQuestion); });
  foot.append(again);

  if (a.url) {
    const link = el('a', 'source', 'Source ↗');
    link.href = a.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    foot.append(link);
  }
  card.append(foot);
  thread.append(card);
  card.scrollIntoView({ block: 'nearest' });
}

function fail(message, retry) {
  const box = el('div', 'oops');
  box.append(el('b', null, 'That did not come back'));
  box.append(el('div', null, esc(message)));
  const b = el('button', null, 'Try again');
  b.type = 'button';
  b.addEventListener('click', () => { box.remove(); retry(); });
  box.append(b);
  thread.append(box);
}

async function ask(raw) {
  const question = String(raw || '').trim();
  if (!question || busy) return;
  busy = true;
  lastQuestion = question;
  send.disabled = true;

  const hi = thread.querySelector('.hello');
  if (hi) hi.remove();

  const row = el('div', 'me');
  row.append(el('span', null, esc(question)));
  thread.append(row);

  const card = steps();
  try {
    const query = topic && question.split(/\s+/).length <= 3 ? `${topic} ${question}` : question;
    card._advance(1);

    const results = await searchEntries(query, 'en', 3);
    if (!results.length) {
      card.remove();
      fail('No entry matched that. Try a name, a place, an event or a thing.', () => ask(question));
      return;
    }
    card._advance(2);

    const top = results[0];
    topic = top.title;

    const written = await askModel(question, results);
    let topics = [];
    try { topics = await entryTopics('en', top.title); } catch { topics = []; }
    card._advance(3);

    const base = compose(top, question, topics);
    card.remove();
    render(written ? { ...base, answer: written, points: [] } : base);
  } catch (err) {
    card.remove();
    fail(String(err?.message || 'A network error interrupted the search.'), () => ask(question));
  } finally {
    busy = false;
    send.disabled = false;
    input.focus();
  }
}

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(160, input.scrollHeight)}px`;
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q || busy) return;
  input.value = '';
  input.style.height = 'auto';
  ask(q);
});

document.getElementById('newChat')?.addEventListener('click', () => { topic = ''; hello(); input.focus(); });

hello();
input.focus();
