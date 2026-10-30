/* indusmova chat — AI-first answers, broken into topics.
 *
 * The rules this file follows, because they were the complaint:
 *
 *   1. The AI answers. There is no "show a source excerpt instead" path. If a
 *      provider fails, the request is retried, and only if every attempt fails
 *      does the thread say so — with a Retry button in the thread.
 *   2. The question never travels back into the input box. It stays in the
 *      thread where it was asked.
 *   3. An answer is laid out the way an assistant lays one out: a direct lead,
 *      then one card per topic, then the sources behind it.
 */

const LANGS = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'sa'];
const SPEECH = {
  en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN',
  gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', ur: 'ur-IN', sa: 'hi-IN',
};

const COPY = {
  en: {
    hello: 'What do you want to <em>understand</em>?',
    intro: 'Ask in your own words. The answer comes back broken into topics, with the sources behind every claim.',
    ask: 'Ask anything…',
    voice: 'Voice', listening: 'Listening…',
    hint: 'Answers are written from the source passages shown under them. Open a source to check a claim.',
    thinking: 'Reading the sources and writing the answer',
    searching: 'Finding the best source',
    writing: 'Writing the answer',
    noResults: 'No article matched that question. Try a shorter phrase, or change the article language.',
    failed: 'The answer could not be written just now.',
    failedBody: 'The AI service did not respond. Your question is still above — press Retry.',
    retry: 'Retry',
    sources: 'Sources',
    copy: 'Copy', copied: 'Copied', save: 'Save', saved: 'Saved',
    speak: 'Read aloud', stopSpeak: 'Stop',
    newChat: 'New chat', savedTitle: 'Saved', noSaved: 'Nothing saved on this device yet.',
    remove: 'Remove', back: 'Back to the chat',
    offline: 'You are offline. Answers need a connection.',
    depth: 'Depth', language: 'Source language', ui: 'Interface',
    quick: 'Quick', detailed: 'Detailed', deep: 'Deep',
    followUp: 'Ask a follow-up',
  },
  hi: {
    hello: 'आप क्या <em>समझना</em> चाहते हैं?',
    intro: 'अपने शब्दों में पूछें। उत्तर विषयों में बँटा हुआ आएगा, और हर दावे के साथ उसका स्रोत रहेगा।',
    ask: 'अपना सवाल लिखें…',
    voice: 'आवाज़', listening: 'सुन रहा है…',
    hint: 'उत्तर नीचे दिए स्रोत-अंशों से लिखे जाते हैं। किसी दावे को जाँचने के लिए स्रोत खोलें।',
    thinking: 'स्रोत पढ़कर उत्तर लिखा जा रहा है',
    searching: 'सबसे अच्छा स्रोत खोजा जा रहा है',
    writing: 'उत्तर लिखा जा रहा है',
    noResults: 'इस सवाल से कोई लेख नहीं मिला। छोटा वाक्यांश आज़माएँ या लेख की भाषा बदलें।',
    failed: 'अभी उत्तर नहीं लिखा जा सका।',
    failedBody: 'AI सेवा ने जवाब नहीं दिया। आपका सवाल ऊपर मौजूद है — फिर कोशिश करें दबाएँ।',
    retry: 'फिर कोशिश करें',
    sources: 'स्रोत',
    copy: 'कॉपी', copied: 'कॉपी हो गया', save: 'सहेजें', saved: 'सहेजा गया',
    speak: 'सुनें', stopSpeak: 'रोकें',
    newChat: 'नई चैट', savedTitle: 'सहेजे गए', noSaved: 'इस डिवाइस पर अभी कुछ सहेजा नहीं है।',
    remove: 'हटाएँ', back: 'चैट पर लौटें',
    offline: 'आप ऑफ़लाइन हैं। उत्तर के लिए इंटरनेट चाहिए।',
    depth: 'गहराई', language: 'स्रोत की भाषा', ui: 'इंटरफ़ेस',
    quick: 'संक्षिप्त', detailed: 'विस्तृत', deep: 'गहन',
    followUp: 'आगे का सवाल',
  },
};

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, max = 8000) => String(v ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);
const wikiUrl = (v) => {
  try {
    const u = new URL(String(v || ''));
    return u.protocol === 'https:' && (u.hostname === 'wikipedia.org' || u.hostname.endsWith('.wikipedia.org')) ? u.href : '';
  } catch { return ''; }
};

const HISTORY_KEY = 'indusmova:chat:thread:v3';
const SAVED_KEY = 'indusmova:chat:saved:v2';
const API = (lang) => `https://${lang}.wikipedia.org/w/api.php`;

let busy = false;
let controller = null;
let speaking = false;
let lastSpoken = '';
let messages = readStore(HISTORY_KEY, []);
let saved = readStore(SAVED_KEY, []);

function readStore(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(v) ? v : fallback;
  } catch { return fallback; }
}
function persist() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-30))); } catch { /* blocked */ }
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved.slice(0, 100))); } catch { /* blocked */ }
}
const lang = () => $('#contentLanguage').value || 'en';
const uiLang = () => $('#uiLanguage').value || 'en';
const t = (k) => (COPY[uiLang()] || COPY.en)[k] || COPY.en[k] || k;

function node(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

/* ── sources from Wikipedia ─────────────────────────────────────────────── */

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
  return list
    .filter((p) => p && !p.missing && p.extract)
    .map((p) => ({
      title: clean(p.title, 200),
      text: clean(p.extract, 1800),
      url: wikiUrl(p.fullurl) || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`,
    }));
}

/* ── the answer, from the AI endpoint ───────────────────────────────────── */

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

/* ── rendering ──────────────────────────────────────────────────────────── */

/** Split "lead + ## Topic" text into a lead and its topics. */
function structure(text) {
  const blocks = String(text || '').split(/^\s*#{2,3}\s+/m);
  const leadRaw = blocks.shift() || '';
  const lead = leadRaw.replace(/^\s*#{1,3}\s*/, '').trim();
  const topics = blocks.map((block) => {
    const [first, ...rest] = block.split('\n');
    const heading = clean(first, 90).replace(/[#*:]+$/, '').trim();
    const body = rest.join('\n').trim() || (heading ? '' : clean(block, 2000));
    return { heading: heading || 'More', body: body || '' };
  }).filter((topic) => topic.body || topic.heading);
  return { lead, topics };
}

function cite(html, prefix) {
  return String(html)
    .replace(/\[(\d{1,2})\]/g, (m, n) => `<a class="citation" href="#${prefix}-${Number(n)}" aria-label="Source ${Number(n)}">${Number(n)}</a>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, ' ');
}

function renderUser(text) {
  const row = node('div', 'msg-user');
  row.append(node('div', 'bubble', esc(text)));
  $('#thread').append(row);
}

function renderAnswer(answer, { store = false } = {}) {
  const prefix = `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const card = node('article', 'msg-ai');

  const head = node('div', 'ai-head');
  head.append(node('span', 'dot'));
  head.append(node('span', null, esc(answer.provider === 'workers-ai' ? 'Workers AI' : (answer.provider || 'AI'))));
  if (answer.title) head.append(node('span', 'title', esc(answer.title)));
  card.append(head);

  const { lead, topics } = structure(answer.answer);
  if (lead) card.append(node('p', 'lead', cite(esc(lead), prefix)));

  for (const topic of topics) {
    const box = node('div', 'topic');
    box.append(node('h3', null, esc(topic.heading)));
    if (topic.body) box.append(node('p', null, cite(esc(topic.body), prefix)));
    card.append(box);
  }

  const sources = (answer.sources || []).filter((s) => s.url && wikiUrl(s.url));
  if (sources.length) {
    const box = node('div', 'sources');
    box.append(node('h4', null, t('sources')));
    for (const s of sources) {
      const a = node('a', 'source');
      a.id = `${prefix}-${Number(s.n)}`;
      a.href = wikiUrl(s.url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (s.cited) a.classList.add('is-cited');
      a.append(node('span', 'n', `[${Number(s.n)}]`));
      a.append(node('span', 't', esc(s.title)));
      a.append(node('span', 'go', '↗'));
      box.append(a);
    }
    card.append(box);
  }

  const actions = node('div', 'actions');
  const copyBtn = node('button', null, t('copy'));
  copyBtn.type = 'button';
  copyBtn.addEventListener('click', async () => {
    const text = [answer.title, lead, ...topics.map((x) => `${x.heading}\n${x.body}`),
      ...sources.map((s) => `[${s.n}] ${s.title} — ${s.url}`)].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = t('copied'); } catch { /* clipboard blocked */ }
  });
  actions.append(copyBtn);

  const saveBtn = node('button', null, t('save'));
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => {
    if (!saved.some((x) => x.answer === answer.answer)) {
      saved.unshift({ ...answer, savedAt: new Date().toISOString() });
      saved = saved.slice(0, 100);
      persist();
    }
    saveBtn.textContent = t('saved');
  });
  actions.append(saveBtn);

  if ('speechSynthesis' in window) {
    const speakBtn = node('button', null, t('speak'));
    speakBtn.type = 'button';
    speakBtn.addEventListener('click', () => speak(answer.answer));
    actions.append(speakBtn);
  }
  card.append(actions);

  $('#thread').append(card);
  lastSpoken = answer.answer || '';
  scrollDown();
  if (store) { messages.push({ type: 'user', text: answer.question }); messages.push({ type: 'ai', data: answer }); persist(); }
}

function renderError(question, depth) {
  const box = node('div', 'err');
  box.append(node('strong', null, esc(t('failed'))));
  box.append(node('p', null, esc(t('failedBody'))));
  const retry = node('button', null, t('retry'));
  retry.type = 'button';
  retry.addEventListener('click', () => { box.remove(); ask(question, depth); });
  box.append(retry);
  $('#thread').append(box);
  scrollDown();
}

function scrollDown() {
  const main = $('#main');
  main.scrollTop = main.scrollHeight;
}

/* ── the ask flow ───────────────────────────────────────────────────────── */

async function ask(raw, depthOverride) {
  const question = clean(raw, 800);
  if (!question || busy) return;
  const depth = depthOverride || $('#answerDepth').value || 'detailed';
  const language = lang();

  busy = true;
  $('#send').disabled = true;
  const stop = $('#stopBtn');
  if (stop) stop.hidden = false;

  const empty = $('#thread .empty');
  if (empty) empty.remove();
  renderUser(question);
  scrollDown();

  const thinking = node('div', 'thinking');
  thinking.append(node('span', 'pulse'));
  const label = node('span', null, t('searching'));
  thinking.append(label);
  $('#thread').append(thinking);
  scrollDown();

  controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const limit = depth === 'quick' ? 4 : depth === 'deep' ? 8 : 6;
    const passages = await searchSources(question, language, limit, controller.signal);
    if (!passages.length) {
      thinking.remove();
      const box = node('div', 'err');
      box.append(node('strong', null, esc(t('noResults'))));
      $('#thread').append(box);
      scrollDown();
      return;
    }

    label.textContent = t('writing');

    let data = null;
    let lastError = null;
    // Two attempts. A cold model or a hiccup should not cost the reader the
    // answer; only two real failures should surface as an error.
    for (let attempt = 0; attempt < 2 && !data; attempt += 1) {
      try {
        data = await askAI(question, passages, depth, controller.signal);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        lastError = err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
      }
    }

    thinking.remove();
    if (!data) {
      renderError(question, depth);
      return;
    }

    renderAnswer({
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
    }, { store: true });
  } catch (err) {
    thinking.remove();
    if (err.name !== 'AbortError') renderError(question, depth);
    else {
      const box = node('div', 'err');
      box.append(node('strong', null, esc(t('failed'))));
      box.append(node('p', null, 'The request took too long and was stopped.'));
      const retry = node('button', null, t('retry'));
      retry.type = 'button';
      retry.addEventListener('click', () => { box.remove(); ask(question, depth); });
      box.append(retry);
      $('#thread').append(box);
      scrollDown();
    }
  } finally {
    clearTimeout(timer);
    controller = null;
    busy = false;
    $('#send').disabled = false;
    if (stop) stop.hidden = true;
  }
}

/* ── voice ──────────────────────────────────────────────────────────────── */

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  if (speaking) { speaking = false; return; }
  const u = new SpeechSynthesisUtterance(String(text).replace(/\[(\d+)\]/g, '').replace(/[#*]/g, ''));
  u.lang = SPEECH[lang()] || 'en-IN';
  u.rate = 0.98;
  speaking = true;
  u.onend = u.onerror = () => { speaking = false; };
  window.speechSynthesis.speak(u);
}

function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const rec = new SR();
  rec.lang = SPEECH[lang()] || 'en-IN';
  rec.interimResults = true;
  rec.continuous = false;
  const btn = $('#voiceBtn');
  btn.textContent = t('listening');
  rec.onresult = (e) => {
    $('#prompt').value = Array.from(e.results).map((r) => r[0].transcript).join(' ');
    autoGrow();
  };
  rec.onerror = rec.onend = () => { btn.textContent = t('voice'); };
  rec.start();
}

/* ── saved answers ──────────────────────────────────────────────────────── */

function showSaved() {
  const thread = $('#thread');
  thread.replaceChildren();

  const head = node('div', 'saved-head');
  head.append(node('h1', null, esc(t('savedTitle'))));
  const back = node('button', null, `← ${esc(t('back'))}`);
  back.type = 'button';
  back.addEventListener('click', () => renderThread());
  head.append(back);
  thread.append(head);

  if (!saved.length) {
    thread.append(node('p', 'hint', esc(t('noSaved'))));
    return;
  }
  for (const item of saved) {
    const box = node('div', 'saved-item');
    box.append(node('h3', null, esc(item.title || 'Answer')));
    box.append(node('p', null, esc(clean(item.answer, 260))));
    const remove = node('button', null, t('remove'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      saved = saved.filter((x) => x !== item);
      persist();
      showSaved();
    });
    box.append(remove);
    thread.append(box);
  }
}

/* ── thread state ───────────────────────────────────────────────────────── */

function renderThread() {
  const thread = $('#thread');
  thread.replaceChildren();
  if (!messages.length) { renderEmpty(); return; }
  for (const m of messages) {
    if (m.type === 'user') renderUser(m.text);
    else if (m.type === 'ai' && m.data) renderAnswer(m.data);
  }
  scrollDown();
}

function renderEmpty() {
  const box = node('div', 'empty');
  box.append(node('h1', null, t('hello')));
  box.append(node('p', null, esc(t('intro'))));
  const grid = node('div', 'suggestions');
  const suggestions = uiLang() === 'hi'
    ? ['यूनिफाइड पेमेंट्स इंटरफेस क्या है?', 'सम्राट अशोक कौन थे?', 'प्रकाश संश्लेषण कैसे होता है?', 'चंद्रयान-3 चंद्रमा पर कब उतरा?']
    : ['What is the Unified Payments Interface?', 'Who was Ashoka?', 'How does photosynthesis work?', 'When did Chandrayaan-3 land on the Moon?'];
  for (const s of suggestions) {
    const b = node('button', null, esc(s));
    b.type = 'button';
    b.addEventListener('click', () => ask(s));
    grid.append(b);
  }
  box.append(grid);
  $('#thread').append(box);
}

function autoGrow() {
  const input = $('#prompt');
  input.style.height = 'auto';
  input.style.height = `${Math.min(180, input.scrollHeight)}px`;
}

function applyCopy() {
  $('#prompt').placeholder = t('ask');
  $('#privacyHint').textContent = t('hint');
  $('#newChat').textContent = t('newChat');
  $('#savedAnswersBtn').textContent = t('savedTitle');
  $('#voiceBtn').textContent = t('voice');
  $('#offline').textContent = t('offline');
  const labels = document.querySelectorAll('.tools label');
  if (labels[0]) labels[0].firstChild.nodeValue = `${t('language')} `;
  if (labels[1]) labels[1].firstChild.nodeValue = `${t('depth')} `;
  if (labels[2]) labels[2].firstChild.nodeValue = `${t('ui')} `;
  const depth = $('#answerDepth').options;
  if (depth[0]) depth[0].textContent = t('quick');
  if (depth[1]) depth[1].textContent = t('detailed');
  if (depth[2]) depth[2].textContent = t('deep');
}

/* ── wiring ─────────────────────────────────────────────────────────────── */

$('#prompt').addEventListener('input', autoGrow);
$('#prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (busy) return;
  const input = $('#prompt');
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  autoGrow();
  ask(value);
});
$('#newChat').addEventListener('click', () => {
  messages = [];
  persist();
  renderThread();
  $('#prompt').focus();
});
$('#savedAnswersBtn').addEventListener('click', showSaved);
$('#voiceBtn').addEventListener('click', startVoice);
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', next === 'dark' ? '#0d1411' : '#f6f4ee'));
  try { localStorage.setItem('indusmova:theme', next); } catch { /* blocked */ }
});
$('#contentLanguage').addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:lang', lang()); } catch { /* blocked */ }
});
$('#answerDepth').addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:depth', $('#answerDepth').value); } catch { /* blocked */ }
});
$('#uiLanguage').addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:ui', uiLang()); } catch { /* blocked */ }
  applyCopy();
  if (!messages.length) { $('#thread').replaceChildren(); renderEmpty(); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && controller) controller.abort();
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
  const theme = localStorage.getItem('indusmova:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch { /* private browsing */ }

if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) $('#voiceBtn').hidden = true;

applyCopy();
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
