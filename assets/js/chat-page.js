/* indusmova chat — one question box, one answer column.
 *
 * Behaviour, in the order it matters:
 *
 *   1. Empty page: the question box sits in the middle of the screen under the
 *      greeting, the way an AI search page opens. Once you ask, the same box
 *      settles at the bottom and the answer fills the column.
 *   2. Nothing ever sends you back to the empty state on its own. A failed
 *      request leaves the question and the reason in the thread, with a Retry
 *      button. Only "New chat" clears it.
 *   3. The answer is laid out as a lead, then one block per topic, then the
 *      sources as chips — no cards inside cards.
 *   4. Read-aloud picks the most natural voice the device actually has and
 *      speaks sentence by sentence, so it does not sound like a robot reading
 *      a paragraph in one breath.
 */

const LANGS = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'sa'];
const SPEECH = {
  en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN',
  gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', ur: 'ur-IN', sa: 'hi-IN',
};

const COPY = {
  en: {
    hello: 'What do you want to <em>understand</em>?',
    intro: 'Ask in your own words. You get a clear answer, broken into topics, with the sources behind every claim.',
    ask: 'Ask anything…',
    hint: 'Answers are written from the sources shown under them.',
    searching: 'Finding the best sources',
    writing: 'Writing the answer',
    noResults: 'No article matched that question. Try a shorter phrase, or change the source language.',
    failed: 'The answer could not be written.',
    failedBody: 'The AI service did not respond in time. Your question is still here — try again.',
    retry: 'Try again',
    sources: 'Sources',
    copy: 'Copy', copied: 'Copied', save: 'Save', saved: 'Saved',
    speak: 'Read aloud', stopSpeak: 'Stop reading',
    followUp: 'Ask more',
    newChat: 'New chat', savedTitle: 'Saved', delete: 'Delete', deleted: 'Deleted', undo: 'Undo',
    hideList: 'Hide chat list', showList: 'Show chat list', options: 'Answer options', noSaved: 'Nothing saved on this device yet.',
    remove: 'Remove', back: 'Back to the chat',
    offline: 'You are offline. Answers need a connection.',
    voice: 'Voice', listening: 'Listening…',
  },
  hi: {
    hello: 'आप क्या <em>समझना</em> चाहते हैं?',
    intro: 'अपने शब्दों में पूछें। उत्तर विषयों में बँटा हुआ आएगा, और हर दावे के साथ उसका स्रोत रहेगा।',
    ask: 'अपना सवाल लिखें…',
    hint: 'उत्तर नीचे दिए स्रोतों से लिखे जाते हैं।',
    searching: 'सबसे अच्छे स्रोत खोजे जा रहे हैं',
    writing: 'उत्तर लिखा जा रहा है',
    noResults: 'इस सवाल से कोई लेख नहीं मिला। छोटा वाक्यांश आज़माएँ या स्रोत की भाषा बदलें।',
    failed: 'उत्तर नहीं लिखा जा सका।',
    failedBody: 'AI सेवा ने समय पर जवाब नहीं दिया। आपका सवाल यहीं है — फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
    sources: 'स्रोत',
    copy: 'कॉपी', copied: 'कॉपी हो गया', save: 'सहेजें', saved: 'सहेजा गया',
    speak: 'सुनें', stopSpeak: 'पढ़ना बंद करें',
    followUp: 'आगे पूछें',
    newChat: 'नई चैट', savedTitle: 'सहेजे गए', delete: 'हटाएँ', deleted: 'हटा दिया', undo: 'वापस लाएँ',
    hideList: 'चैट सूची छिपाएँ', showList: 'चैट सूची दिखाएँ', options: 'उत्तर के विकल्प', noSaved: 'इस डिवाइस पर अभी कुछ सहेजा नहीं है।',
    remove: 'हटाएँ', back: 'चैट पर लौटें',
    offline: 'आप ऑफ़लाइन हैं। उत्तर के लिए इंटरनेट चाहिए।',
    voice: 'आवाज़', listening: 'सुन रहा है…',
  },
};

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, max = 8000) => String(v ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max);
const wikiUrl = (v) => {
  try {
    const u = new URL(String(v || ''));
    return u.protocol === 'https:' && (u.hostname === 'wikipedia.org' || u.hostname.endsWith('.wikipedia.org')) ? u.href : '';
  } catch { return ''; }
};

const THREAD_KEY = 'indusmova:chat:thread:v4';
const RECENT_KEY = 'indusmova:chat:recent:v1';
const SAVED_KEY = 'indusmova:chat:saved:v3';
const API = (lang) => `https://${lang}.wikipedia.org/w/api.php`;

let busy = false;
let controller = null;
let messages = readStore(THREAD_KEY, []);
let saved = readStore(SAVED_KEY, []);
let speaking = false;
let recent = readStore(RECENT_KEY, []);
let activeQuestion = '';

function readStore(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(v) ? v : fallback;
  } catch { return fallback; }
}
function persist() {
  try { localStorage.setItem(THREAD_KEY, JSON.stringify(messages.slice(-30))); } catch { /* blocked */ }
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved.slice(0, 100))); } catch { /* blocked */ }
}
const lang = () => $('#contentLanguage').value || 'en';
const uiLang = () => $('#uiLanguage').value || 'en';
const t = (k) => (COPY[uiLang()] || COPY.en)[k] || COPY.en[k] || k;

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* ── layout: the box stays where the hand expects it ─────────────────────
 * The composer used to be *moved* into the empty state while there was no
 * conversation, and moved back out to the body on the first question. That is
 * the audit's F-01: on an empty chat the box floated about two-thirds down the
 * page with dead space beneath it, and when the first answer arrived the whole
 * page jumped — the reader's pointer was no longer over Send.
 *
 * The box now never moves. It is the last row of the main column, so it is on
 * the floor whether the thread is empty or not; only the class changes, and
 * the CSS decides what the empty state looks like. */
function setEmpty(empty) {
  document.body.classList.toggle('is-empty', empty);
}

/* ── sources ────────────────────────────────────────────────────────────── */
async function searchSources(query, language, limit, signal) {
  const url = new URL(API(language));
  const params = {
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: query, gsrlimit: String(limit),
    prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1',
    exchars: '1800', redirects: '1',
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.href, { headers: { accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages;
  const list = Array.isArray(pages) ? pages : (pages ? Object.values(pages) : []);
  return list.filter((p) => p && !p.missing && p.extract).map((p) => ({
    title: clean(p.title, 200),
    text: clean(p.extract, 1800),
    url: wikiUrl(p.fullurl) || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`,
  }));
}

async function askAI(question, passages, depth, signal) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    signal,
    body: JSON.stringify({ question, depth, passages: passages.map((p) => ({ title: p.title, text: p.text, url: p.url })) }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.answer) {
    const err = new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ── markdown ─────────────────────────────────────────────────────────────
 * The model answers in markdown. Showing it raw — literal ## and ** in the
 * middle of a sentence — is what made the chat look unfinished. This turns it
 * into real elements: headings, lists, bold, inline code, quotes, rules,
 * simple tables and links.
 *
 * Safety: the text is escaped first, then only our own tags are introduced, so
 * nothing the model writes can become markup of its own. Links are restricted
 * to http(s) and the citation markers become links to the source chips.
 */
function inlineMd(text, prefix) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[(\d{1,2})\]/g, (m, n) => `<a class="cite" href="#${prefix}-${Number(n)}" aria-label="Source ${Number(n)}">${Number(n)}</a>`);
}

function markdown(src, prefix) {
  // Defence in depth: if a heading still arrives mid-sentence (a model that
  // ignored the formatting rule, or an answer cached before this fix), break
  // it onto its own line so it renders as a heading instead of showing ##.
  const escaped = esc(String(src || ''))
    .replace(/\r\n/g, '\n')
    .replace(/([^\n])\s+(#{2,3}\s)/g, '$1\n$2');
  const lines = escaped.split('\n');
  const out = [];
  let list = null;      // 'ul' | 'ol' | null
  let para = [];
  let quote = [];
  let code = null;      // { lang, lines } while inside a fenced block

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inlineMd(para.join(' '), prefix)}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };
  const flushQuote = () => {
    if (quote.length) { out.push(`<blockquote>${inlineMd(quote.join(' '), prefix)}</blockquote>`); quote = []; }
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    // Inside a fenced block every line is code: keep it verbatim (already
    // escaped) until the closing fence. Dropping the markers used to throw the
    // code away entirely and leave prose where a snippet had been.
    if (code) {
      if (/^```/.test(line.trim())) {
        const lang = code.lang ? ` class="language-${esc(code.lang)}"` : '';
        out.push(`<pre><code${lang}>${code.lines.join('\n')}</code></pre>`);
        code = null;
      } else {
        code.lines.push(raw);
      }
      continue;
    }

    if (!line.trim()) { flushAll(); continue; }

    // fenced code
    if (/^```/.test(line.trim())) {
      flushAll();
      code = { lang: line.trim().slice(3).trim(), lines: [] };
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushAll(); out.push('<hr>'); continue; }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = Math.min(4, Math.max(2, h[1].length));
      out.push(`<h${level}>${inlineMd(h[2], prefix)}</h${level}>`);
      continue;
    }

    // blockquote — the text is escaped first, so the marker arrives as &gt;
    if (/^(&gt;|>)\s?/.test(line)) { flushPara(); flushList(); quote.push(line.replace(/^(&gt;|>)\s?/, '')); continue; }
    flushQuote();

    // table row (kept simple: header + rows, separators dropped)
    if (/^\|.*\|$/.test(line.trim())) {
      flushAll();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue;
      out.push(`<div class="md-row">${cells.map((c) => `<span>${inlineMd(c, prefix)}</span>`).join('')}</div>`);
      continue;
    }

    // lists
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if (list && list !== want) flushList();
      if (!list) { list = want; out.push(`<${want}>`); }
      out.push(`<li>${inlineMd((ul || ol)[1], prefix)}</li>`);
      continue;
    }
    flushList();

    para.push(line.trim());
  }
  flushAll();
  return out.join('');
}

/* ── typewriter ───────────────────────────────────────────────────────────
 * The answer arrives whole, then is revealed a few words at a time with the
 * markdown re-rendered as it grows, so headings and lists appear as they are
 * being written rather than popping in at the end. Readers who ask their
 * system to reduce motion get the finished answer straight away.
 */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function typeOut(target, text, prefix) {
  const full = String(text || '');
  if (prefersReducedMotion() || full.length > 6000) {
    target.innerHTML = markdown(full, prefix);
    return;
  }
  const chunks = full.split(/(\s+)/);
  let i = 0;
  target.classList.add('typing');
  const step = () => {
    i = Math.min(chunks.length, i + 3);
    target.innerHTML = markdown(chunks.slice(0, i).join(''), prefix);
    scrollDown();
    if (i < chunks.length) {
      setTimeout(step, 16);
    } else {
      target.classList.remove('typing');
    }
  };
  step();
}

/* ── rendering ──────────────────────────────────────────────────────────── */
function renderQuestion(text) {
  const row = el('div', 'q');
  row.textContent = text;
  // The question is in whatever language it was typed in. Saying so lets a
  // screen reader pronounce it correctly in a bilingual thread.
  row.lang = lang();
  row.dir = 'auto';
  $('#thread').append(row);
}

function renderAnswer(a, { store = false, animate = true } = {}) {
  const prefix = `s${Date.now().toString(36)}`;
  const box = el('article', 'a');
  const inner = el('div', 'a-body');
  box.append(inner);

  // The answer follows the question's language, so it carries its own lang and
  // direction rather than inheriting the page's English.
  box.lang = lang();
  box.dir = 'auto';

  const meta = el('div', 'a-meta');
  meta.append(el('span', 'dot'));
  meta.append(el('span', 'who', 'indusmova'));
  meta.append(el('span', 'badge', esc(a.provider === 'workers-ai' ? 'Workers AI' : (a.provider || 'AI'))));
  if (a.title) meta.append(el('span', 'src-name', esc(a.title)));
  inner.append(meta);

  const body = el('div', 'md');
  inner.append(body);
  // Only a freshly written answer is typed out. Re-opening the chat used to
  // replay the whole thread character by character, which cost time and made
  // a returning reader wait for text they had already read.
  if (animate) typeOut(body, a.answer, prefix);
  else body.innerHTML = markdown(a.answer, prefix);

  const sources = (a.sources || []).filter((s) => s.url && wikiUrl(s.url));
  if (sources.length) {
    // Sources as cards, not as a row of pills that truncate every title to
    // "Chandray…". A reader checking a claim needs the whole name of the
    // article and the site it came from, side by side.
    const panel = el('div', 'src-panel');
    panel.append(el('p', 'src-head', esc(t('sources'))));
    const grid = el('div', 'src-cards');
    for (const s of sources) {
      const card = el('a', 'src-card');
      card.id = `${prefix}-${Number(s.n)}`;
      card.href = wikiUrl(s.url);
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.append(el('span', 'src-n', String(Number(s.n))));
      const body = el('span', 'src-body');
      body.append(el('span', 'src-t', esc(s.title)));
      body.append(el('span', 'src-d', `${lang()}.wikipedia.org`));
      card.append(body);
      grid.append(card);
    }
    panel.append(grid);
    inner.append(panel);
  }

  const actions = el('div', 'a-actions');
  const copy = el('button', null, t('copy'));
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    const text = [a.title, a.answer,
      ...sources.map((s) => `[${s.n}] ${s.title} — ${s.url}`)].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(text); copy.textContent = t('copied'); } catch { /* blocked */ }
  });
  actions.append(copy);

  const save = el('button', null, t('save'));
  save.type = 'button';
  save.addEventListener('click', () => {
    if (!saved.some((x) => x.answer === a.answer)) {
      saved.unshift({ ...a, savedAt: new Date().toISOString() });
      saved = saved.slice(0, 100);
      persist();
    }
    save.textContent = t('saved');
  });
  actions.append(save);

  if ('speechSynthesis' in window) {
    const speakBtn = el('button', null, t('speak'));
    speakBtn.type = 'button';
    speakBtn.addEventListener('click', () => toggleSpeak(a.answer, speakBtn));
    actions.append(speakBtn);
  }
  const regen = el('button', null, 'Regenerate');
  regen.type = 'button';
  regen.addEventListener('click', () => {
    if (!a.question || busy) return;
    // The question bubble sitting above this answer belongs to it. Leaving it
    // in place meant Regenerate re-asked the question and printed a second,
    // identical bubble right under the first.
    const asked = box.previousElementSibling;
    if (asked && asked.classList.contains('q')) asked.remove();
    box.remove();
    messages = messages.filter((m) => !(m.type === 'a' && m.data === a));
    const lastQ = messages[messages.length - 1];
    if (lastQ && lastQ.type === 'q') messages.pop();
    persist();
    ask(a.question);
  });
  inner.append(actions);

  // A short row of next questions, the way an AI page offers them.
  if (a.title) {
    const follow = el('div', 'followups');
    const ideas = uiLang() === 'hi'
      ? [`${a.title} का इतिहास क्या है?`, `${a.title} क्यों महत्वपूर्ण है?`, `${a.title} के मुख्य तथ्य बताइए`]
      : [`What is the history of ${a.title}?`, `Why does ${a.title} matter?`, `Key facts about ${a.title}`];
    for (const idea of ideas) {
      const b = el('button', null, esc(idea));
      b.type = 'button';
      b.addEventListener('click', () => ask(idea));
      follow.append(b);
    }
    inner.append(follow);
  }

  $('#thread').append(box);
  // Only the newest answer offers a regenerate, so the thread does not fill
  // with buttons that would each re-run an old question. The test runs after
  // the answer is in the thread, because before that the newest answer is the
  // previous one.
  if ([...$('#thread').querySelectorAll('.a')].pop() === box) actions.append(regen);
  scrollDown();
  if (store) {
    messages.push({ type: 'q', text: a.question });
    messages.push({ type: 'a', data: a });
    persist();
  }
}

function renderNote(title, body, retryQuestion, depth) {
  const box = el('div', 'note');
  box.append(el('strong', null, esc(title)));
  box.append(el('p', null, esc(body)));
  if (retryQuestion) {
    const btn = el('button', null, t('retry'));
    btn.type = 'button';
    btn.addEventListener('click', () => { box.remove(); ask(retryQuestion, depth); });
    box.append(btn);
  }
  $('#thread').append(box);
  scrollDown();
}

function scrollDown() {
  const main = $('#main');
  main.scrollTop = main.scrollHeight;
}

/** A quiet "back to the latest answer" control, shown only when scrolled up. */
function initJumpButton() {
  const btn = el('button', 'jump', '↓ Latest');
  btn.type = 'button';
  btn.hidden = true;
  btn.addEventListener('click', () => scrollDown());
  document.body.append(btn);
  const main = $('#main');
  main.addEventListener('scroll', () => {
    const away = main.scrollHeight - main.scrollTop - main.clientHeight > 240;
    btn.hidden = !away || document.body.classList.contains('is-empty');
  }, { passive: true });
}

/* ── asking ─────────────────────────────────────────────────────────────── */
async function ask(raw, depthOverride) {
  const question = clean(raw, 800);
  if (!question || busy) return;
  const depth = depthOverride || $('#answerDepth').value || 'detailed';
  const language = lang();

  busy = true;
  setEmpty(false);
  $('#send').disabled = true;
  const stop = $('#stopBtn');
  if (stop) stop.hidden = false;

  renderQuestion(question);
  rememberQuestion(question);
  const titleEl = $('#chatTitle');
  if (titleEl) titleEl.textContent = question;
  scrollDown();

  const working = el('div', 'working');
  working.setAttribute('role', 'status');
  working.append(el('span', 'chakra-loader'));
  const label = el('span', null, t('searching'));
  working.append(label);
  $('#thread').append(working);
  scrollDown();

  controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const limit = depth === 'quick' ? 4 : depth === 'deep' ? 8 : 6;
    const passages = await searchSources(question, language, limit, controller.signal);
    if (!passages.length) {
      working.remove();
      renderNote(t('noResults'), '', null, depth);
      return;
    }

    label.textContent = t('writing');

    let data = null;
    for (let attempt = 0; attempt < 2 && !data; attempt += 1) {
      try {
        data = await askAI(question, passages, depth, controller.signal);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
      }
    }

    working.remove();
    if (!data) {
      renderNote(t('failed'), t('failedBody'), question, depth);
      return;
    }

    const finished = {
      question,
      title: passages[0]?.title || '',
      answer: data.answer,
      sources: (data.sources || []).map((s) => ({
        n: Number(s.n) || 1,
        title: clean(s.title, 200),
        url: wikiUrl(s.url),
        cited: Boolean(s.cited),
      })),
      provider: data.provider || 'AI',
      model: data.model || '',
    };
    renderAnswer(finished, { store: true });
    attachAnswer(question, finished);
    syncDeleteButton();
  } catch (err) {
    working.remove();
    if (err.name === 'AbortError') {
      renderNote(t('failed'), 'The request took too long and was stopped.', question, depth);
    } else {
      renderNote(t('failed'), t('failedBody'), question, depth);
    }
  } finally {
    clearTimeout(timer);
    controller = null;
    busy = false;
    $('#send').disabled = false;
    if (stop) stop.hidden = true;
    scrollDown();
  }
}

/* ── voice out: pick the best voice, speak in sentences ─────────────────── */
let voiceCache = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voiceCache = window.speechSynthesis.getVoices() || [];
}
if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

function bestVoice(code) {
  const want = SPEECH[code] || 'en-IN';
  const base = want.split('-')[0];
  const pool = voiceCache.filter((v) => v.lang === want || v.lang.replace('_', '-').startsWith(base));
  if (!pool.length) return null;
  const score = (v) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/natural|neural|premium|enhanced|siri/.test(n)) s += 6;
    if (/google/.test(n)) s += 5;
    if (!v.localService) s += 3;          // cloud voices sound markedly better
    if (v.lang === want) s += 3;
    if (/compact|espeak|festival|robot/.test(n)) s -= 6;
    return s;
  };
  return pool.slice().sort((a, b) => score(b) - score(a))[0];
}

function chunkSentences(text) {
  const flat = String(text || '')
    .replace(/\[(\d+)\]/g, '')
    .replace(/[#*_`>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = flat.match(/[^.!?।]+[.!?।]+|\S[^.!?।]*$/g) || [flat];
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > 180 && buf) { out.push(buf.trim()); buf = p; }
    else buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean).slice(0, 40);
}

function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  speaking = false;
  document.querySelectorAll('.a-actions button[data-speak]').forEach((b) => {
    b.dataset.speak = 'off';
    b.textContent = t('speak');
  });
}

function toggleSpeak(text, button) {
  if (!('speechSynthesis' in window) || !text) return;
  if (speaking) { stopSpeaking(); return; }

  stopSpeaking();
  const voice = bestVoice(lang());
  const chunks = chunkSentences(text);
  if (!chunks.length) return;

  speaking = true;
  button.dataset.speak = 'on';
  button.textContent = t('stopSpeak');

  let i = 0;
  const speakNext = () => {
    if (!speaking || i >= chunks.length) { stopSpeaking(); return; }
    const u = new SpeechSynthesisUtterance(chunks[i++]);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    else u.lang = SPEECH[lang()] || 'en-IN';
    // Slightly slower than default reads as deliberate rather than robotic.
    u.rate = 0.97;
    u.pitch = 1.0;
    u.volume = 1;
    u.onend = speakNext;
    u.onerror = stopSpeaking;
    window.speechSynthesis.speak(u);
  };
  speakNext();
}

/* ── voice in ───────────────────────────────────────────────────────────── */
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const rec = new SR();
  rec.lang = SPEECH[lang()] || 'en-IN';
  rec.interimResults = true;
  rec.continuous = false;
  const btn = $('#voiceBtn');
  btn.setAttribute('aria-label', t('listening'));
  btn.classList.add('is-listening');
  rec.onresult = (e) => {
    $('#prompt').value = Array.from(e.results).map((r) => r[0].transcript).join(' ');
    autoGrow();
  };
  rec.onerror = rec.onend = () => { btn.setAttribute('aria-label', t('voice')); btn.classList.remove('is-listening'); };
  // start() throws when the microphone permission is denied, when another
  // recognition is already running, or when the browser has no microphone at
  // all. Left unguarded that surfaced as an uncaught error and the button
  // stayed stuck in its listening state with no way back.
  try {
    rec.start();
  } catch {
    btn.setAttribute('aria-label', t('voice'));
    btn.classList.remove('is-listening');
    // `toast` is a DOM node in this file, not a helper — the status line under
    // the composer is the right place to say this.
    const hint = $('#privacyHint');
    if (hint) hint.textContent = t('voiceUnsupported');
  }
}

/* ── saved ──────────────────────────────────────────────────────────────── */
function showSaved() {
  setEmpty(false);
  const thread = $('#thread');
  thread.replaceChildren();
  const top = el('div', 'saved-top');
  top.append(el('h2', null, esc(t('savedTitle'))));
  const back = el('button', 'ghost', `← ${esc(t('back'))}`);
  back.type = 'button';
  back.addEventListener('click', () => renderThread());
  top.append(back);
  thread.append(top);

  if (!saved.length) { thread.append(el('p', 'hint', esc(t('noSaved')))); return; }
  for (const item of saved) {
    const card = el('div', 'saved-card');
    card.append(el('h3', null, esc(item.title || 'Answer')));
    card.append(el('p', null, esc(clean(item.answer, 240))));
    const remove = el('button', 'ghost', t('remove'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      saved = saved.filter((x) => x !== item);
      persist();
      showSaved();
    });
    card.append(remove);
    thread.append(card);
  }
}

/* ── the rail ───────────────────────────────────────────────────────────── */
function rememberQuestion(question) {
  recent = [{ q: question, at: Date.now(), answer: null }, ...recent.filter((r) => r.q !== question)].slice(0, 25);
  activeQuestion = question;
  persistRecent();
  renderRail();
}

/**
 * Keep the finished answer with its question.
 *
 * Without this the rail only held the words of the question, so clicking a
 * past chat sent the whole request again — another Wikipedia search and
 * another paid model call for text that had already been written. The answer
 * now lives in the browser, so reopening a chat is a read, not a request.
 */
function attachAnswer(question, answer) {
  const hit = recent.find((r) => r.q === question);
  if (hit) hit.answer = answer;
  else recent.unshift({ q: question, at: Date.now(), answer });
  persistRecent();
  renderRail();
}

function persistRecent() {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* blocked */ }
}

/** Reopen a saved chat from the browser — no network, no cost. */
function openSaved(item) {
  if (!item) return;
  messages = [];
  activeQuestion = item.q;
  $('#thread').replaceChildren();
  renderQuestion(item.q);
  if (item.answer) renderAnswer(item.answer, { animate: false });
  const titleEl = $('#chatTitle');
  if (titleEl) titleEl.textContent = item.q;
  setEmpty(false);
  renderRail();
  syncDeleteButton();
  scrollDown();
  $('#prompt').focus();
}

function renderRail() {
  const filter = ($('#railSearch')?.value || '').trim().toLowerCase();

  const list = $('#railList');
  if (!list) return;
  list.replaceChildren();
  const shown = filter ? recent.filter((r) => r.q.toLowerCase().includes(filter)) : recent;

  const countEl = $('#railCount');
  if (countEl) countEl.textContent = shown.length ? String(shown.length) : '';
  const clearBtn = $('#railClear');
  if (clearBtn) clearBtn.hidden = !recent.length;

  if (!shown.length) {
    list.append(el('p', 'rail-empty', filter ? 'No chats match that.' : 'Your questions will appear here.'));
    return;
  }

  // Today first, then everything older — recency at a glance, without a date
  // on every row.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const groups = [
    { label: filter ? 'Matches' : 'Today', items: [] },
    { label: 'Earlier', items: [] },
  ];
  for (const item of shown) {
    const when = Number(item.at) || 0;
    (when >= startOfToday.getTime() ? groups[0] : groups[1]).items.push(item);
  }

  for (const group of groups) {
    if (!group.items.length) continue;
    list.append(el('p', 'rail-group', group.label));
    for (const item of group.items) {
      const row = el('div', 'rail-row');
      if (item.q === activeQuestion) row.classList.add('is-active');

      const btn = el('button', 'rail-item', esc(item.q));
      btn.type = 'button';
      btn.title = item.q;
      if (item.q === activeQuestion) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        if (busy) return;
        openSaved(item);
        // On a phone the rail is a drawer: opening a chat reveals the thread.
        if (window.matchMedia('(max-width: 820px)').matches) setRail(true);
      });
      row.append(btn);

      // One click deletes, one undo restores. No dialog to dismiss first.
      const del = el('button', 'rail-del');
      del.type = 'button';
      del.title = `${t('delete')}: ${item.q}`;
      del.setAttribute('aria-label', `${t('delete')}: ${item.q}`);
      del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteChat(item);
      });
      row.append(del);
      list.append(row);
    }
  }
}

/* ── deleting a chat ──────────────────────────────────────────────────────
   A chat lives in this browser and nowhere else, so deleting it is final.
   The undo below is not decoration: it is the only way back, and it holds
   the removed item in memory for six seconds before letting it go. */
let undoBuffer = null;
let undoTimer = null;

function deleteChat(item) {
  if (!item) return;
  const index = recent.indexOf(item);
  recent = recent.filter((r) => r !== item);
  persistRecent();
  undoBuffer = { item, index: index < 0 ? 0 : index };
  renderRail();

  const wasOpen = item.q === activeQuestion;
  if (wasOpen) {
    activeQuestion = '';
    messages = [];
    persist();
    $('#thread').replaceChildren();
    const titleEl = $('#chatTitle');
    if (titleEl) titleEl.textContent = t('newChat');
    setEmpty(true);
    syncDeleteButton();
  }
  showUndoToast(item.q);
}

function showUndoToast(question) {
  document.querySelector('.chat-toast')?.remove();
  const toast = el('div', 'chat-toast');
  toast.setAttribute('role', 'status');
  toast.append(el('span', null, `${esc(t('deleted'))}: ${esc(question.slice(0, 40))}${question.length > 40 ? '…' : ''}`));
  const undo = el('button', null, esc(t('undo')));
  undo.type = 'button';
  undo.addEventListener('click', () => {
    if (!undoBuffer) return;
    const { item, index } = undoBuffer;
    recent = [...recent.slice(0, index), item, ...recent.slice(index)];
    undoBuffer = null;
    persistRecent();
    renderRail();
    toast.remove();
  });
  toast.append(undo);
  document.body.append(toast);
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    toast.remove();
    undoBuffer = null;
  }, 6000);
}

/** The header's bin only exists while there is something to delete. */
function syncDeleteButton() {
  const btn = $('#deleteChatBtn');
  if (!btn) return;
  btn.hidden = !(activeQuestion || messages.length);
}

/* ── thread ─────────────────────────────────────────────────────────────── */
function renderThread() {
  const thread = $('#thread');
  thread.replaceChildren();
  if (!messages.length) {
    setEmpty(true);
    return;
  }
  setEmpty(false);
  const lastQ = [...messages].reverse().find((m) => m.type === 'q');
  if (lastQ) activeQuestion = lastQ.text;
  for (const m of messages) {
    if (m.type === 'q') renderQuestion(m.text);
    else if (m.type === 'a' && m.data) renderAnswer(m.data, { animate: false });
  }
  scrollDown();
}

function renderSuggestions() {
  const box = $('#suggestions');
  box.replaceChildren();
  const ideas = uiLang() === 'hi'
    ? [['विषय समझें', 'प्रकाश संश्लेषण कैसे होता है?'],
       ['तथ्य जाँचें', 'चंद्रयान-3 चंद्रमा पर कब उतरा?'],
       ['और गहरे जाएँ', 'सम्राट अशोक कौन थे और क्यों महत्वपूर्ण हैं?']]
    : [['Explain a topic', 'How does photosynthesis work?'],
       ['Check a fact', 'When did Chandrayaan-3 land on the Moon?'],
       ['Go deeper', 'Who was Ashoka, and why does he matter?']];
  for (const [label, idea] of ideas) {
    const b = el('button', null, `<b>${esc(label)}</b><span>${esc(idea)}</span>`);
    b.type = 'button';
    b.addEventListener('click', () => ask(idea));
    box.append(b);
  }
}

function applyCopy() {
  $('#empty .empty-heading').innerHTML = t('hello');
  $('#empty p').textContent = t('intro');
  $('#prompt').placeholder = t('ask');
  const ph = $('#privacyHint');
  if (ph) ph.textContent = t('hint');
  const vb = $('#voiceBtn');
  if (vb) vb.setAttribute('aria-label', t('voice'));
  const off = $('#offline');
  if (off) off.textContent = t('offline');
  renderSuggestions();
}

function autoGrow() {
  const input = $('#prompt');
  input.style.height = 'auto';
  input.style.height = `${Math.min(168, input.scrollHeight)}px`;
}

/* ── wiring ─────────────────────────────────────────────────────────────── */
$('#prompt').addEventListener('input', autoGrow);
$('#prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuestion(); }
});
function submitQuestion() {
  if (busy) return;
  const input = $('#prompt');
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  autoGrow();
  ask(value);
}
// The button is type="button" on purpose: if it could submit the form, a tap
// before this module attaches would reload the page and drop the reader back
// on an empty question box. Nothing here can navigate.
$('#send').addEventListener('click', submitQuestion);
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); submitQuestion(); });
$('#stopBtn')?.addEventListener('click', () => { if (controller) controller.abort(); });
$('#railNew')?.addEventListener('click', startNewChat);
function startNewChat() {
  stopSpeaking();
  messages = [];
  persist();
  activeQuestion = '';
  // Not `const t = …`: that shadowed the translation helper `t()` for the rest
  // of this function, so the next `t('…')` added here would have thrown.
  const titleEl = $('#chatTitle');
  if (titleEl) titleEl.textContent = t('newChat');
  $('#thread').replaceChildren();
  setEmpty(true);
  renderRail();
  syncDeleteButton();
  $('#prompt').focus();
}

/* ── folding the chat list away ──────────────────────────────────────────
   The list is useful until it is in the way. One button hides it, the same
   button brings it back, and the choice is remembered per browser. */
const RAIL_KEY = 'indusmova:chat:rail';
function setRail(hidden, remember = true) {
  document.body.classList.toggle('rail-hidden', hidden);
  const btn = $('#railToggle');
  if (btn) {
    btn.setAttribute('aria-expanded', String(!hidden));
    btn.setAttribute('aria-label', hidden ? t('showList') : t('hideList'));
    btn.title = `${hidden ? t('showList') : t('hideList')} (Ctrl+B)`;
  }
  if (remember) { try { localStorage.setItem(RAIL_KEY, hidden ? 'hidden' : 'shown'); } catch { /* blocked */ } }
}
$('#railToggle')?.addEventListener('click', () => setRail(!document.body.classList.contains('rail-hidden')));
try {
  const remembered = localStorage.getItem(RAIL_KEY);
  // On a phone the list is a drawer, so it starts closed unless the reader
  // has said otherwise on this device.
  const small = window.matchMedia('(max-width: 900px)').matches;
  setRail(remembered ? remembered === 'hidden' : small, false);
} catch { /* blocked */ }

/* ── answer options, in one panel ────────────────────────────────────────*/
const optionsPanel = $('#optionsPanel');
const optionsBtn = $('#optionsBtn');
const plusBtn = $('#plusBtn');
function paintOptions() {
  if (!optionsBtn) return;
  const depth = $('#answerDepth')?.selectedOptions?.[0]?.textContent || 'Detailed';
  const source = $('#contentLanguage')?.selectedOptions?.[0]?.textContent || 'English';
  optionsBtn.textContent = `${depth} · ${source}`;
}
function setOptions(open) {
  if (!optionsPanel) return;
  optionsPanel.hidden = !open;
  optionsBtn?.setAttribute('aria-expanded', String(open));
  plusBtn?.setAttribute('aria-expanded', String(open));
  if (open) optionsPanel.querySelector('select')?.focus();
}
optionsBtn?.addEventListener('click', () => setOptions(optionsPanel?.hidden ?? true));
plusBtn?.addEventListener('click', () => setOptions(optionsPanel?.hidden ?? true));
document.addEventListener('click', (event) => {
  if (!optionsPanel || optionsPanel.hidden) return;
  if (event.target.closest('#optionsPanel, #optionsBtn, #plusBtn')) return;
  setOptions(false);
});
['#answerDepth', '#contentLanguage', '#uiLanguage'].forEach((sel) => {
  $(sel)?.addEventListener('change', paintOptions);
});
paintOptions();

$('#deleteChatBtn')?.addEventListener('click', () => {
  const item = recent.find((r) => r.q === activeQuestion);
  if (item) deleteChat(item);
  else startNewChat();
});
$('#savedAnswersBtn')?.addEventListener('click', showSaved);
$('#railSearch')?.addEventListener('input', () => renderRail());

// Clear the whole list in one deliberate step. This is not undoable the way a
// single delete is, so it asks first and then says what happened.
$('#railClear')?.addEventListener('click', () => {
  if (!recent.length) return;
  if (!window.confirm(`Delete all ${recent.length} chats from this browser? Saved answers are kept.`)) return;
  recent = [];
  persistRecent();
  undoBuffer = null;
  activeQuestion = '';
  messages = [];
  persist();
  $('#thread').replaceChildren();
  const titleEl = $('#chatTitle');
  if (titleEl) titleEl.textContent = t('newChat');
  setEmpty(true);
  syncDeleteButton();
  renderRail();
  $('#prompt').focus();
});
$('#voiceBtn')?.addEventListener('click', startVoice);
$('#themeBtn')?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', next === 'dark' ? '#0e1211' : '#fdfdfb'));
  // The same key the rest of the site reads, so one change applies everywhere.
  try { localStorage.setItem('indusmova:theme', next); } catch { /* blocked */ }
});
$('#contentLanguage')?.addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:lang', lang()); } catch { /* blocked */ }
});
$('#answerDepth')?.addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:depth', $('#answerDepth').value); } catch { /* blocked */ }
});
$('#uiLanguage')?.addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:ui', uiLang()); } catch { /* blocked */ }
  applyCopy();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    setRail(!document.body.classList.contains('rail-hidden'));
    return;
  }
  // The rail advertises ⌘K on the New chat button, so it has to work — and
  // on Windows and Linux the same keystroke is Ctrl+K.
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    startNewChat();
    return;
  }
  if (e.key === 'Escape') {
    if (optionsPanel && !optionsPanel.hidden) { setOptions(false); return; }
    if (controller) controller.abort();
    else if (speaking) stopSpeaking();
  }
  if (e.key === '/' && !e.target.closest('input, textarea, select')) {
    e.preventDefault();
    $('#prompt').focus();
  }
});

const syncConnection = () => {
  const offline = !navigator.onLine;
  $('#offline').hidden = !offline;
  $('#send').disabled = offline || busy;
};
window.addEventListener('online', syncConnection);
window.addEventListener('offline', syncConnection);

/* ── boot ───────────────────────────────────────────────────────────────── */
try {
  const savedLang = localStorage.getItem('indusmova:chat:lang');
  if (LANGS.includes(savedLang)) $('#contentLanguage').value = savedLang;
  else if (navigator.language && navigator.language.toLowerCase().startsWith('hi')) $('#contentLanguage').value = 'hi';
  const savedDepth = localStorage.getItem('indusmova:chat:depth');
  if (['quick', 'detailed', 'deep'].includes(savedDepth)) $('#answerDepth').value = savedDepth;
  const savedUi = localStorage.getItem('indusmova:chat:ui');
  if (savedUi === 'hi' || savedUi === 'en') $('#uiLanguage').value = savedUi;
  // The theme is one setting for the whole site, not one per page. The site
  // stores "auto" when the reader has never chosen, and this page used to
  // ignore that value — so it stayed dark while every other page followed the
  // system. "auto" is resolved here the same way theme.js resolves it.
  let theme = 'auto';
  try { theme = localStorage.getItem('indusmova:theme') || 'auto'; } catch { /* blocked */ }
  const systemDark = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;
  if (resolved === 'light' || resolved === 'dark') {
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', resolved === 'dark' ? '#0e1211' : '#fdfdfb');
    });
  }
} catch { /* private browsing */ }

if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) $('#voiceBtn').hidden = true;

applyCopy();
initJumpButton();
renderRail();
renderThread();
syncConnection();
autoGrow();

const startQuestion = clean(new URLSearchParams(location.search).get('q') || '', 800);
if (startQuestion) {
  history.replaceState(null, '', location.pathname);
  ask(startQuestion);
} else {
  $('#prompt').focus();
}
