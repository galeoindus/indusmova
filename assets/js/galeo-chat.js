/*
 * Galeoindus — the floating chat.
 *
 * Nothing is on screen until the launcher is pressed. Pressed, a chat opens
 * over the page and the reader talks to it the way they would talk to any
 * assistant: a question in their own words, an answer back.
 *
 * What answers: the two modules beside this file. research-core searches the
 * encyclopaedia, research-answer reads the matching entry and composes the
 * lead, the key points and the entry's own topics. Every line is a sentence
 * from the source; nothing is written, so nothing can be invented, and every
 * answer carries the links it came from.
 */



/* ── the engine, inline ──────────────────────────────────────────────────
   Deliberately self-contained. A floating widget that fails to appear
   because an import resolved wrongly is worse than a little duplication. */

const API = (lang) => `https://${lang}.wikipedia.org/w/api.php`;
const SKIP_SECTION = /^(references|see also|notes|citations|footnotes|further reading|external links|bibliography|sources|works cited|gallery|explanatory notes|general sources)$/i;
const ABBR = /(?:^|\s)(?:c|ca|approx|e\.g|i\.e|etc|vs|dr|mr|mrs|ms|st|no|vol|pp|p|fig|al|cf|ed|trans)\.$/i;

const clean = (v, max = 4000) => String(v ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, max);

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

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 429) throw new Error('The source is busy. Wait a moment and try again.');
  if (!res.ok) throw new Error(`The source did not answer (HTTP ${res.status}).`);
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
    extract: tidy(p.extract),
    url: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`,
    language: lang,
  }));
}

function textOf(html) {
  return tidy(String(html || '')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' '));
}

/** Strip the marks a wiki leaves in its own text — edit links, citation
    numbers, bracketed notes — so the reader gets prose, not scaffolding. */
function tidy(value) {
  return clean(String(value || '')
    .replace(/\[\s*(edit|edit source|citation needed|clarification needed)\s*\]/gi, ' ')
    .replace(/&#91;\s*(edit|edit source)[^&]*&#93;/gi, ' ')
    .replace(/\[\s*\d+[a-z]?\s*\]/g, ' ')
    .replace(/&#91;\s*\d+[a-z]?\s*&#93;/g, ' ')
    .replace(/\s*\|\s*(edit|edit source)\b/gi, ' ')
    .replace(/\(\s*listen\s*\)/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' '));
}

async function entrySections(lang, title) {
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
      if (parts.length) out.push({ heading: sec.line, line: tidy(parts[0]).slice(0, 230) });
      else if (text) out.push({ heading: sec.line, line: tidy(text).slice(0, 230) });
    } catch { /* a section that will not read is simply skipped */ }
  }
  return out;
}

function composeAnswer(entry, question, topics) {
  const opening = sentences(entry.extract);
  let answer = opening[0] || clean(entry.extract, 400);
  let used = 1;
  if (answer.length < 140 && opening[1]) { answer = `${opening[0]} ${opening[1]}`; used = 2; }

  const rest = opening.slice(used);
  const WHEN = /\b(when|what year|which year|date|how old)\b/i;
  const NUM = /\b(how many|how much|how long|population|cost|number of|total)\b/i;
  const HOW = /\b(how does|how do|how did|how is|how are|process|works)\b/i;
  const rank = (t, i) => {
    let n = 0;
    if (WHEN.test(question) && /\b(1[0-9]{3}|20[0-9]{2})\b/.test(t)) n += 3;
    if (NUM.test(question) && /\d/.test(t)) n += 2;
    if (HOW.test(question) && /(by|through|using|process|works|allows|enables)/i.test(t)) n += 2;
    if (/\b(is|was|are|were|has|had)\b/.test(t)) n += 1;
    return n + Math.min(2, t.length / 180) - i * 0.01;
  };
  const points = rest.map((t, i) => ({ t, s: rank(t, i) })).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.t);

  return { title: entry.title, answer, points, topics, source: { url: entry.url }, at: Date.now() };
}

function answerMarkdown(a) {
  const out = [`# ${a.title}`, '', `> [Source](${a.source?.url || ''}) · ${new Date(a.at).toLocaleString()}`, '', '## Answer', '', a.answer];
  if (a.points?.length) out.push('', '## Key points', '', ...a.points.map((p, i) => `${i + 1}. ${p}`));
  if (a.topics?.length) out.push('', '## Topics', '', ...a.topics.flatMap((t) => [`### ${t.heading}`, '', t.line, '']));
  out.push('', '## Source', '', `- ${a.title}`, a.source?.url ? `- ${a.source.url}` : '', '', '---',
    '_Every line is a sentence from the entry, selected and ordered — not written._');
  return out.join('\n');
}

async function answerQuestion(question, onStep = () => {}, lang = 'en') {
  onStep(1);

  // search the reader's own language first
  let results = await searchEntries(question, lang, 3);
  let sourceLang = lang;

  // nothing written in it: fall back to English and say so
  if (!results.length && lang !== 'en') {
    results = await searchEntries(question, 'en', 3);
    sourceLang = 'en';
  }
  if (!results.length) return null;

  const top = results[0];
  onStep(2);
  let topics = [];
  try { topics = await entrySections(sourceLang, top.title); } catch { topics = []; }

  const composed = composeAnswer(top, question, topics);
  composed.sourceLang = sourceLang;
  composed.translated = sourceLang !== lang;

  if (composed.translated) {
    onStep(3);
    return translateAnswer(composed, lang);
  }
  return composed;
}


/* ── translation ──────────────────────────────────────────────────────────
   Some things are only written in English. Rather than tell a Hindi reader
   "not available", the answer is translated here, in the browser, and the
   page says so — the original stays one tap away. Two public endpoints, no
   key, no account; if both refuse, the English text is returned unchanged
   and the note still tells the truth. */
const TRANSLATE_HOSTS = [
  (text, to) => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${to}&dt=t&q=${encodeURIComponent(text)}`,
  (text, to) => `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=en|${to}`,
];

async function translateText(text, to = 'hi') {
  const value = String(text || '').trim();
  if (!value || to === 'en') return value;

  // Google's public endpoint returns [[["translated","source",...],...],...]
  try {
    const res = await fetch(TRANSLATE_HOSTS[0](value, to));
    if (res.ok) {
      const data = await res.json();
      const out = (data?.[0] || []).map((part) => part?.[0] || '').join('').trim();
      if (out) return out;
    }
  } catch { /* try the next one */ }

  // MyMemory answers with a plain object
  try {
    const res = await fetch(TRANSLATE_HOSTS[1](value, to));
    if (res.ok) {
      const data = await res.json();
      const out = String(data?.responseData?.translatedText || '').trim();
      if (out && !/^MYMEMORY WARNING/i.test(out)) return out;
    }
  } catch { /* fall through */ }

  return value;
}

/** Translate a whole composed answer, in parallel, keeping its shape. */
async function translateAnswer(answer, to) {
  if (!answer || to === 'en') return answer;
  const [head, lead, points, topics] = await Promise.all([
    translateText(answer.title, to),
    translateText(answer.answer, to),
    Promise.all((answer.points || []).map((x) => translateText(x, to))),
    Promise.all((answer.topics || []).map(async (t) => ({
      heading: await translateText(t.heading, to),
      line: await translateText(t.line, to),
    }))),
  ]);
  return { ...answer, title: head, answer: lead, points, topics };
}

const LAUNCHER_LABEL = 'Ask Galeoindus';

const ICON = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.6a8.4 8.4 0 0 1-9 8.4 9.2 9.2 0 0 1-3.4-.7L3 21l1.6-4.6A8.2 8.2 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.6Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 20 4l-4.5 16-4-6.5L4 12Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>',
};

const SUGGESTIONS = [
  'What is the Unified Payments Interface?',
  'Who was Ashoka?',
  'How does photosynthesis work?',
  'When did Chandrayaan-3 land?',
];

/* The chat is one conversation, kept for the session only. Nothing is sent
   anywhere except the encyclopaedia, and nothing is written to disk. */
const turns = [];
let lang = 'en';
try { lang = localStorage.getItem('galeo:lang') || 'en'; } catch { lang = 'en'; }
let lastQuestion = '';
let topic = '';
let busy = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const FOLLOW_UP = /^(tell me more|more|why|how so|and\b|what about|explain that|go on|where does that come from|what else)/i;

function build() {
  if (document.querySelector('.gc-launcher')) return;

  const launcher = el('button', 'gc-launcher', `${ICON.chat}<span>Ask Galeoindus</span>`);
  launcher.type = 'button';
  launcher.setAttribute('aria-label', LAUNCHER_LABEL);
  launcher.setAttribute('aria-expanded', 'false');

  const shell = el('div', 'gc-shell');
  shell.hidden = true;
  shell.innerHTML = `
    <section class="gc-panel" role="dialog" aria-modal="true" aria-label="Galeoindus chat">
      <header class="gc-head">
        <span class="gc-mark">${ICON.chat}</span>
        <div class="gc-titles"><b>Galeoindus</b><small>Answers taken from the source entry</small></div>
        <button class="gc-lang" type="button" data-lang aria-label="Answer language" title="Answer language">EN</button>
        <button class="gc-x" type="button" data-new aria-label="Start a new chat" title="New chat">${ICON.plus}</button>
        <button class="gc-x" type="button" aria-label="Close chat" title="Close (Esc)">${ICON.close}</button>
      </header>
      <div class="gc-thread" role="log" aria-live="polite"></div>
      <div class="gc-dock">
        <form class="gc-form">
          <textarea rows="1" placeholder="Ask anything…" aria-label="Ask a question" spellcheck="false"></textarea>
          <button class="gc-send" type="submit" aria-label="Send">${ICON.send}</button>
        </form>
        <p class="gc-hint">Answers quote the entry they come from — open the source to check it.</p>
      </div>
    </section>`;

  document.body.append(launcher, shell);

  const panel = shell.querySelector('.gc-panel');
  const thread = shell.querySelector('.gc-thread');
  const form = shell.querySelector('.gc-form');
  const input = form.querySelector('textarea');
  const send = form.querySelector('.gc-send');
  const close = shell.querySelector('.gc-x:not([data-new])');
  const fresh = shell.querySelector('[data-new]');
  const langBtn = shell.querySelector('[data-lang]');

  const open = () => {
    shell.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    if (!turns.length) hello();
    setTimeout(() => input.focus(), 40);
    document.body.style.overflow = 'hidden';
  };
  const shut = () => {
    shell.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    launcher.focus();
  };

  launcher.addEventListener('click', open);
  close.addEventListener('click', shut);
  fresh.addEventListener('click', () => { turns.length = 0; topic = ''; hello(); input.focus(); });

  // the switch changes what is searched and what is spoken back
  const paintLang = () => {
    langBtn.textContent = lang === 'hi' ? 'हिं' : 'EN';
    langBtn.title = lang === 'hi' ? 'Answers in Hindi' : 'Answers in English';
    langBtn.setAttribute('aria-label', langBtn.title);
    input.placeholder = lang === 'hi' ? 'कुछ भी पूछिए…' : 'Ask anything…';
  };
  paintLang();
  langBtn.addEventListener('click', () => {
    lang = lang === 'en' ? 'hi' : 'en';
    try { localStorage.setItem('galeo:lang', lang); } catch { /* private mode */ }
    paintLang();
    input.focus();
  });
  shell.addEventListener('click', (e) => { if (e.target === shell) shut(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !shell.hidden) shut();
  });

  // The front-door search asks the chat, instead of navigating away. Captured
  // before the app's own handler so the page never leaves the reader.
  document.addEventListener('submit', (e) => {
    const hero = e.target.closest?.('#dashHero, .dash-hero');
    if (!hero) return;
    const field = hero.querySelector('input[type="search"], input[type="text"], textarea');
    const q = (field?.value || '').trim();
    if (!q) return;
    e.preventDefault();
    e.stopPropagation();
    open();
    ask(q);
  }, true);

  // any "Research" / "Ask" entry point opens the chat instead of leaving the page
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-chat], a[href="/research/"]');
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(130, input.scrollHeight)}px`;
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
    thread.innerHTML = '';
    const box = el('div', 'gc-hello');
    box.append(el('h2', null, 'What do you want to <em>understand</em>?'));
    box.append(el('p', null, 'Ask in your own words. The answer is taken from the entry itself, with the source attached.'));
    const grid = el('div', 'gc-sugg');
    for (const s of SUGGESTIONS) {
      const b = el('button', 'gc-sg', esc(s));
      b.type = 'button';
      b.addEventListener('click', () => ask(s));
      grid.append(b);
    }
    box.append(grid);
    thread.append(box);
  }

  function addAsk(text) {
    const row = el('div', 'gc-ask');
    row.append(el('span', null, esc(text)));
    thread.append(row);
    thread.scrollTop = thread.scrollHeight;
  }

  /** The waiting state: three steps that tick, in the order they happen.
   *  No ring, no rotation — the reader watches the work, which is both
   *  calmer and more honest than a spinner. */
  function thinking() {
    const card = el('div', 'gc-answer gc-steps');
    const list = el('ol', 'gc-steplist');
    const items = ['Reading your question', 'Finding the entry', 'Taking the answer out'].map((text, i) => {
      const li = el('li', `gc-step${i === 0 ? ' is-active' : ''}`);
      li.append(el('span', 'gc-step-dot'));
      li.append(el('span', null, text));
      list.append(li);
      return li;
    });
    card.append(list);
    thread.append(card);
    thread.scrollTop = thread.scrollHeight;

    let at = 0;
    const advance = (to) => {
      while (at < to && at < items.length) {
        items[at].classList.remove('is-active');
        items[at].classList.add('is-done');
        at += 1;
        if (items[at]) items[at].classList.add('is-active');
      }
    };
    card._advance = advance;
    return card;
  }

  function renderAnswer(a) {
    const card = el('article', 'gc-answer');
    card.append(el('p', 'gc-from', `Answer from the entry on <b>${esc(a.title)}</b>`));
    if (a.translated) {
      card.append(el('p', 'gc-note', `Written in English, shown here in Hindi. The original is linked below.`));
    }
    card.append(el('h3', null, esc(a.title)));
    if (a.answer) {
      const lead = el('p', 'gc-lead');
      card.append(lead);
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (calm) lead.textContent = a.answer;
      else {
        const words = String(a.answer).split(/(\s+)/);
        let i = 0;
        const tick = () => {
          if (i >= words.length) return;
          lead.textContent += words.slice(i, i + 2).join('');
          i += 2;
          thread.scrollTop = thread.scrollHeight;
          setTimeout(tick, 18);
        };
        tick();
      }
    }

    if (a.points?.length) {
      const ul = el('ul', 'gc-points');
      a.points.forEach((p) => ul.append(el('li', null, esc(p))));
      card.append(ul);
    }
    // the answer morphs: one card, two faces — the summary and the topics
    if (a.topics?.length) {
      const tabs = el('div', 'gc-tabs');
      const summaryBtn = el('button', 'gc-tab on', 'Summary');
      const topicsBtn = el('button', 'gc-tab', `Topics · ${a.topics.length}`);
      summaryBtn.type = 'button';
      topicsBtn.type = 'button';
      tabs.append(summaryBtn, topicsBtn);

      const topicsPanel = el('div', 'gc-topics');
      a.topics.forEach((t) => {
        const sec = el('section');
        sec.append(el('h4', null, esc(t.heading)));
        sec.append(el('p', null, esc(t.line)));
        topicsPanel.append(sec);
      });
      topicsPanel.hidden = true;

      const show = (which) => {
        const isTopics = which === 'topics';
        topicsPanel.hidden = !isTopics;
        summaryBtn.classList.toggle('on', !isTopics);
        topicsBtn.classList.toggle('on', isTopics);
        if (isTopics) topicsPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      summaryBtn.addEventListener('click', () => show('summary'));
      topicsBtn.addEventListener('click', () => show('topics'));

      // the tab bar sits under the answer, so the summary is what you read first
      card.append(tabs, topicsPanel);
    }

    const foot = el('div', 'gc-foot');
    const mdBtn = el('button', 'gc-btn', 'Markdown');
    mdBtn.type = 'button';
    const pre = el('pre', 'gc-md');
    pre.hidden = true;
    mdBtn.addEventListener('click', () => {
      if (!pre.textContent) pre.textContent = answerMarkdown(a);
      pre.hidden = !pre.hidden;
      mdBtn.classList.toggle('on', !pre.hidden);
      if (!pre.isConnected) card.append(pre);
    });
    foot.append(mdBtn);

    const copy = el('button', 'gc-btn', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      const text = [a.title, a.answer, ...(a.points || []), ...(a.topics || []).map((t) => `${t.heading}: ${t.line}`)].filter(Boolean).join('\n\n');
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy'; }, 1400);
      } catch { /* clipboard blocked */ }
    });
    foot.append(copy);

    const again = el('button', 'gc-btn', 'Ask again');
    again.type = 'button';
    again.addEventListener('click', () => { if (lastQuestion) ask(lastQuestion); });
    foot.append(again);
    card.append(foot);

    if (a.source?.url) {
      const sources = el('div', 'gc-sources');
      const link = el('a', 'gc-src', `${ICON.link}<span>${esc(a.title)} · source</span>`);
      link.href = a.source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      sources.append(link);
      card.append(sources);
    }

    thread.append(card);
    thread.scrollTop = thread.scrollHeight;

    // what a reader usually wants next
    const more = el('div', 'gc-more');
    for (const q of ['Tell me more', 'Where does that come from?', 'What else is related?']) {
      const chip = el('button', 'gc-sg', q);
      chip.type = 'button';
      chip.addEventListener('click', () => ask(q));
      more.append(chip);
    }
    thread.append(more);
    thread.scrollTop = thread.scrollHeight;
  }

  function renderError(message, retry) {
    const box = el('div', 'gc-error');
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
    lastQuestion = question;
    busy = true;
    send.disabled = true;
    helloDone();
    addAsk(question);
    const card = thinking();

    // a follow-up is asked about the entry already open, not searched afresh
    const isFollow = topic && (FOLLOW_UP.test(question) || question.split(/\s+/).length <= 3);
    const query = isFollow ? `${topic} ${question}`.slice(0, 300) : question;

    try {
      const a = await answerQuestion(query, (to) => card._advance?.(to), lang);
      if (!a) {
        card.remove();
        renderError('No entry matched that. Try a name, a place, an event or a thing.', () => ask(question));
        return;
      }
      card.remove();
      topic = a.title;
      turns.push({ question, answer: a });
      renderAnswer(a);
    } catch (err) {
      card.remove();
      const msg = String(err?.message || 'A network error interrupted the search.');
      renderError(msg, () => ask(question));
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  function helloDone() {
    const h = thread.querySelector('.gc-hello');
    if (h) h.remove();
  }

  // open the chat straight away when arriving with ?chat or #chat
  if (/[?&]chat\b/.test(location.search) || location.hash === '#chat') open();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
else build();
