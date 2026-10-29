/*
 * Galeoindus — the floating assistant.
 *
 * A round button in the corner; pressed, a chat opens over the page. It
 * answers in two ways and says which one it used:
 *
 *   1. through /api/ask, the Cloudflare Workers AI binding, when the binding
 *      is enabled on the project — the model is given the passages that were
 *      found and told to answer only from them;
 *   2. from the entry itself, in the browser, when the binding is not there
 *      or the model call fails — the lead, the key points and the topics are
 *      taken straight out of the article.
 *
 * Either way the answer carries the source it came from, and the second path
 * is not a downgrade the reader is left guessing about: the card says which
 * one produced it.
 */

const ICON = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.6a8.4 8.4 0 0 1-9 8.4 9.2 9.2 0 0 1-3.4-.7L3 21l1.6-4.6A8.2 8.2 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.6Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 20 4l-4.5 16-4-6.5L4 12Z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>',
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
const SKIP_SECTION = /^(references|see also|notes|citations|footnotes|further reading|external links|bibliography|sources|works cited|gallery|explanatory notes|general sources)$/i;

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
    language: lang,
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
    .filter((s) => s.line && !SKIP_SECTION.test(s.line) && !/^\d+$/.test(s.line))
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
    } catch { /* skip a section that will not read */ }
  }
  return out;
}

const WHEN_Q = /\b(when|what year|which year|date|how old)\b/i;
const NUM_Q = /\b(how many|how much|how long|population|cost|number of|total)\b/i;
const HOW_Q = /\b(how does|how do|how did|how is|process|works)\b/i;

function composeFromEntry(entry, question, topics) {
  const opening = sentences(entry.extract);
  let answer = opening[0] || clean(entry.extract, 400);
  let used = 1;
  if (answer.length < 140 && opening[1]) { answer = `${opening[0]} ${opening[1]}`; used = 2; }

  const rank = (t, i) => {
    let n = 0;
    if (WHEN_Q.test(question) && /\b(1[0-9]{3}|20[0-9]{2})\b/.test(t)) n += 3;
    if (NUM_Q.test(question) && /\d/.test(t)) n += 2;
    if (HOW_Q.test(question) && /(by|through|using|process|works|allows)/i.test(t)) n += 2;
    if (/\b(is|was|are|were|has|had)\b/.test(t)) n += 1;
    return n - i * 0.01;
  };
  const points = opening.slice(used)
    .map((t, i) => ({ t, s: rank(t, i) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => x.t);

  return { title: entry.title, answer, points, topics, url: entry.url, mode: 'entry' };
}

/** Ask the Workers AI binding, grounded on the passages. */
async function askModel(question, passages) {
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question,
        passages: passages.map((p) => ({ title: p.title, text: p.extract })),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = clean(data?.answer, 3000);
    return text ? text : null;
  } catch { return null; }
}

function build() {
  if (document.querySelector('.gx-launch')) return;

  const launcher = el('button', 'gx-launch', ICON.chat);
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Ask Galeoindus');
  launcher.setAttribute('aria-expanded', 'false');

  const shell = el('div', 'gx-shell');
  shell.hidden = true;
  shell.innerHTML = `
    <section class="gx-window" role="dialog" aria-modal="true" aria-label="Galeoindus">
      <header class="gx-head">
        <span class="gx-dot">${ICON.chat}</span>
        <div class="gx-title"><b>Galeoindus</b><small>Answers with the source attached</small></div>
        <button class="gx-btn" type="button" data-new aria-label="New chat" title="New chat">${ICON.plus}</button>
        <button class="gx-btn" type="button" data-close aria-label="Close" title="Close (Esc)">${ICON.close}</button>
      </header>
      <div class="gx-thread" role="log" aria-live="polite"></div>
      <div class="gx-dock">
        <form class="gx-form">
          <textarea rows="1" placeholder="Ask anything…" aria-label="Ask a question" spellcheck="false"></textarea>
          <button class="gx-send" type="submit" aria-label="Send">${ICON.send}</button>
        </form>
        <p class="gx-hint">Every answer quotes the entry it came from — open the source to check it.</p>
      </div>
    </section>`;

  document.body.append(launcher, shell);

  const thread = shell.querySelector('.gx-thread');
  const form = shell.querySelector('.gx-form');
  const input = form.querySelector('textarea');
  const send = form.querySelector('.gx-send');
  const closeBtn = shell.querySelector('[data-close]');
  const newBtn = shell.querySelector('[data-new]');

  let busy = false;
  let topic = '';
  let lastQuestion = '';

  const open = () => {
    shell.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    if (!thread.children.length) hello();
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 40);
  };
  const shut = () => {
    shell.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    launcher.focus();
  };

  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', shut);
  newBtn.addEventListener('click', () => { thread.innerHTML = ''; topic = ''; hello(); input.focus(); });
  shell.addEventListener('click', (e) => { if (e.target === shell) shut(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !shell.hidden) shut(); });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-chat], a[href="/research/"]');
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
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

  function hello() {
    const box = el('div', 'gx-hello');
    box.append(el('h2', null, 'What do you want to <em>understand</em>?'));
    box.append(el('p', null, 'Ask in your own words. The answer is taken from the entry itself, with the source attached.'));
    const grid = el('div', 'gx-sugg');
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
    const card = el('div', 'gx-answer');
    const list = el('ol', 'gx-steps');
    const items = ['Reading your question', 'Finding the entry', 'Writing the answer'].map((text, i) => {
      const li = el('li', `gx-step${i === 0 ? ' on' : ''}`);
      li.append(el('span', 'gx-step-dot'));
      li.append(el('span', null, text));
      list.append(li);
      return li;
    });
    card.append(list);
    thread.append(card);
    thread.scrollTop = thread.scrollHeight;

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
    const card = el('article', 'gx-answer');
    card.append(el('p', 'gx-src-line', `Answer from <b>${esc(a.title)}</b>`));
    card.append(el('h3', null, esc(a.title)));
    if (a.answer) card.append(el('p', 'gx-lead', esc(a.answer)));

    if (a.points?.length) {
      const ul = el('ul', 'gx-points');
      a.points.forEach((p) => ul.append(el('li', null, esc(p))));
      card.append(ul);
    }
    if (a.topics?.length) {
      const box = el('div', 'gx-topics');
      a.topics.forEach((t) => {
        const sec = el('section');
        sec.append(el('h4', null, esc(t.heading)));
        sec.append(el('p', null, esc(t.line)));
        box.append(sec);
      });
      card.append(box);
    }

    const foot = el('div', 'gx-foot');
    const copy = el('button', 'gx-chip', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      const text = [a.title, a.answer, ...(a.points || []), ...(a.topics || []).map((t) => `${t.heading}: ${t.line}`)].filter(Boolean).join('\n\n');
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1400); } catch { /* blocked */ }
    });
    foot.append(copy);

    const again = el('button', 'gx-chip', 'Ask again');
    again.type = 'button';
    again.addEventListener('click', () => { if (lastQuestion) ask(lastQuestion); });
    foot.append(again);

    if (a.url) {
      const link = el('a', 'gx-link', `${ICON.link}<span>Source</span>`);
      link.href = a.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      foot.append(link);
    }
    card.append(foot);
    thread.append(card);
    thread.scrollTop = thread.scrollHeight;

    const more = el('div', 'gx-sugg');
    for (const q of ['Tell me more', 'Where does that come from?']) {
      const b = el('button', null, q);
      b.type = 'button';
      b.addEventListener('click', () => ask(q));
      more.append(b);
    }
    thread.append(more);
    thread.scrollTop = thread.scrollHeight;
  }

  function fail(message, retry) {
    const box = el('div', 'gx-error');
    box.append(el('b', null, 'That did not come back'));
    box.append(el('div', null, esc(message)));
    const b = el('button', null, 'Try again');
    b.type = 'button';
    b.addEventListener('click', () => { box.remove(); retry(); });
    box.append(b);
    thread.append(box);
    thread.scrollTop = thread.scrollHeight;
  }

  async function ask(raw) {
    const question = String(raw || '').trim();
    if (!question || busy) return;
    busy = true;
    lastQuestion = question;
    send.disabled = true;

    const helloBox = thread.querySelector('.gx-hello');
    if (helloBox) helloBox.remove();

    const row = el('div', 'gx-ask');
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

      // the model first, if the binding is live; the entry itself otherwise
      const written = await askModel(question, results);
      let topics = [];
      try { topics = await entryTopics('en', top.title); } catch { topics = []; }
      card._advance(3);

      const entryAnswer = composeFromEntry(top, question, topics);
      const a = written
        ? { ...entryAnswer, answer: written, points: [], mode: 'model' }
        : entryAnswer;

      card.remove();
      render(a);
    } catch (err) {
      card.remove();
      fail(String(err?.message || 'A network error interrupted the search.'), () => ask(question));
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  if (/[?&]chat\b/.test(location.search) || location.hash === '#chat') open();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
else build();
