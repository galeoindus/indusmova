/* indusmova chat — bilingual, source-linked, local-history progressive app. */

const SUGGESTIONS = {
  en: ['What is the Unified Payments Interface?', 'Who was Ashoka?', 'How does photosynthesis work?', 'When did Chandrayaan-3 land?'],
  hi: ['यूनिफाइड पेमेंट्स इंटरफेस क्या है?', 'सम्राट अशोक कौन थे?', 'प्रकाश संश्लेषण कैसे होता है?', 'चंद्रयान-3 चंद्रमा पर कब उतरा?'],
};
const LANGS = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'sa'];
// BCP-47 tags for the Web Speech API. Passing a bare "ta" made the browser fall
// back to the system default voice, so a Tamil answer was read in English.
// Sanskrit has no installed voice anywhere, so it reads with the Hindi voice
// rather than failing silently.
const SPEECH = {
  en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN',
  gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', ur: 'ur-IN', sa: 'hi-IN',
};
const COPY = {
  en: {
    hello: 'What do you want to <em>understand</em>?',
    intro: 'Ask in your own words. AI helps explain the source passages; every answer keeps links to the material it used.',
    ask: 'Ask anything…', voice: 'Voice input', listening: 'Listening… speak now', stopVoice: 'Stop listening',
    hint: 'AI answers are grounded in the source passages shown below. Check the original before relying on a claim.',
    search: 'Searching sources', answer: 'Answer', from: 'Evidence from', noResults: 'No matching articles were found. Try a shorter phrase or change the article language.',
    fallback: 'The AI service is unavailable right now. Showing a source excerpt instead.', source: 'Source', sources: 'Sources to check',
    copy: 'Copy', copied: 'Copied', save: 'Save answer', saved: 'Saved', speak: 'Read answer aloud', stopSpeak: 'Stop reading',
    noSpeech: 'Voice input is not supported in this browser.', savedTitle: 'Saved answers', noSaved: 'No saved answers on this device yet.',
    newChat: 'New chat', error: 'The search could not be completed. Check your connection and try again.', savedOnDevice: '{count} saved on this device', remove: 'Remove',
    ai: 'AI answer', excerpt: 'Source excerpt', depth: 'Answer depth', provider: 'Answer engine',
    stop: 'Stop', back: 'Back to the conversation', offline: 'You are offline. Search and chat need a connection.',
    followUp: 'Ask a follow-up', question: 'Your question', retry: 'Try again',
  },
  hi: {
    hello: 'आप क्या <em>समझना</em> चाहते हैं?',
    intro: 'अपने शब्दों में सवाल पूछें। AI स्रोतों के अंशों को समझाने में मदद करता है और उत्तर के साथ स्रोत भी दिखाता है।',
    ask: 'अपना सवाल लिखें…', voice: 'आवाज़ से पूछें', listening: 'सुन रहा है… बोलिए', stopVoice: 'सुनना बंद करें',
    hint: 'AI के उत्तर नीचे दिखाए गए स्रोतों पर आधारित होते हैं। किसी दावे पर भरोसा करने से पहले मूल स्रोत जाँचें।',
    search: 'स्रोत खोजे जा रहे हैं', answer: 'उत्तर', from: 'इस स्रोत से प्रमाण', noResults: 'कोई मिलता-जुलता लेख नहीं मिला। छोटा सवाल लिखें या लेख की भाषा बदलें।',
    fallback: 'AI सेवा अभी उपलब्ध नहीं है। इसके बजाय स्रोत का अंश दिखाया जा रहा है।', source: 'स्रोत', sources: 'जाँचने के लिए स्रोत',
    copy: 'कॉपी', copied: 'कॉपी हो गया', save: 'उत्तर सहेजें', saved: 'सहेजा गया', speak: 'उत्तर सुनें', stopSpeak: 'पढ़ना बंद करें',
    noSpeech: 'इस ब्राउज़र में आवाज़ से इनपुट उपलब्ध नहीं है।', savedTitle: 'सहेजे गए उत्तर', noSaved: 'इस डिवाइस पर अभी कोई उत्तर नहीं सहेजा गया है।',
    newChat: 'नई चैट', error: 'खोज पूरी नहीं हो सकी। इंटरनेट कनेक्शन जाँचकर फिर कोशिश करें।', savedOnDevice: 'इस डिवाइस पर {count} उत्तर सहेजे गए', remove: 'हटाएँ',
    ai: 'AI उत्तर', excerpt: 'स्रोत का अंश', depth: 'उत्तर की गहराई', provider: 'उत्तर इंजन', contentLanguage: 'लेख की भाषा', interfaceLanguage: 'इंटरफ़ेस', quick: 'संक्षिप्त', detailed: 'विस्तृत', deep: 'गहन शोध', reading: 'लेख पढ़ा जा रहा है', preparing: 'स्रोतों सहित उत्तर तैयार हो रहा है',
    stop: 'रोकें', back: 'बातचीत पर लौटें', offline: 'आप ऑफ़लाइन हैं। खोज और चैट के लिए इंटरनेट चाहिए।',
    followUp: 'आगे का सवाल पूछें', question: 'आपका सवाल', retry: 'फिर कोशिश करें',
  },
};

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const clean = (value, max = 8_000) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);
const safeWikiUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && (url.hostname === 'wikipedia.org' || url.hostname.endsWith('.wikipedia.org')) ? url.href : '';
  } catch { return ''; }
};
const API = (lang) => `https://${lang}.wikipedia.org/w/api.php`;
const SKIP = /^(references|see also|notes|citations|footnotes|further reading|external links|bibliography|sources|works cited|gallery|explanatory notes|general sources)$/i;
const STORE_KEY = 'indusmova:chat:v2';
const SAVED_KEY = 'indusmova:chat:saved:v1';

let busy = false;
let activeController = null;
let topic = '';
let lastAnswerText = '';
let recognition = null;
let isSpeaking = false;
let answerSequence = 0;
let messages = readStore(STORE_KEY, []);
let savedAnswers = readStore(SAVED_KEY, []);

function readStore(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) ? value : fallback;
  } catch { return fallback; }
}
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* storage can be blocked or full */ }
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedAnswers.slice(0, 100))); } catch { /* saved answers remain session-only */ }
}
function lang() { return $('#contentLanguage').value || 'en'; }
function uiLang() { return $('#uiLanguage').value || 'en'; }
function t(key) { return COPY[uiLang()]?.[key] || COPY.en[key] || key; }
function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

function sentences(text) {
  const parts = String(text || '').split(/(?<=[.!?।])\s+/);
  const kept = [];
  for (const part of parts) {
    const value = part.trim();
    if (value.length > 30) kept.push(value);
  }
  return kept;
}

async function getJson(url, signal) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function searchEntries(query, language, limit, signal) {
  const url = new URL(API(language));
  const params = {
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: query, gsrlimit: String(limit),
    prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1',
    exchars: '1600', redirects: '1',
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const data = await getJson(url.href, signal);
  const pages = data?.query?.pages;
  const list = Array.isArray(pages) ? pages : (pages ? Object.values(pages) : []);
  return list.filter((page) => page && !page.missing && page.extract).map((page) => ({
    title: clean(page.title, 200),
    extract: clean(page.extract, 1_600),
    url: safeWikiUrl(page.fullurl) || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`,
  }));
}

function htmlText(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,style,sup,.mw-editsection').forEach((node) => node.remove());
  return clean(doc.body.textContent, 1_200);
}

async function entryTopics(language, title, limit, signal) {
  const common = { action: 'parse', format: 'json', formatversion: '2', origin: '*', page: title };
  const sectionsUrl = new URL(API(language));
  Object.entries({ ...common, prop: 'sections' }).forEach(([key, value]) => sectionsUrl.searchParams.set(key, value));
  const listing = await getJson(sectionsUrl.href, signal);
  const sections = (listing?.parse?.sections || [])
    .filter((section) => section.line && !SKIP.test(section.line) && !/^\d+$/.test(section.line))
    .slice(0, limit);

  return Promise.all(sections.map(async (section) => {
    try {
      const url = new URL(API(language));
      Object.entries({ ...common, prop: 'text', section: section.index }).forEach(([key, value]) => url.searchParams.set(key, value));
      const data = await getJson(url.href, signal);
      const value = htmlText(data?.parse?.text);
      const first = sentences(value)[0] || value;
      return first ? { heading: clean(section.line, 80), line: clean(first, 260) } : null;
    } catch { return null; }
  })).then((rows) => rows.filter(Boolean));
}

function composeExcerpt(entry, question, topics) {
  const parts = sentences(entry.extract);
  const answer = parts.slice(0, 2).join(' ') || entry.extract;
  const points = parts.slice(2, 6);
  return { title: entry.title, answer, points, topics, url: entry.url, sources: [{ n: 1, title: entry.title, url: entry.url, cited: true }], provider: 'source-excerpt', model: 'Wikipedia source text' };
}

async function askModel(question, results, depth, signal) {
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      signal,
      body: JSON.stringify({
        question,
        depth,
        passages: results.map((item) => ({ title: item.title, text: item.extract, url: item.url })),
      }),
    });
    const data = await response.json();
    if (!response.ok || !data?.answer) return null;
    const byTitle = new Map(results.map((item) => [item.title, item]));
    const sources = Array.isArray(data.sources) ? data.sources.map((source, index) => {
      const match = byTitle.get(source.title);
      return {
        n: Number(source.n) || index + 1,
        title: clean(source.title || match?.title, 200),
        url: safeWikiUrl(source.url || match?.url),
        cited: Boolean(source.cited),
      };
    }).filter((source) => source.title && source.url) : [];
    return {
      answer: clean(data.answer),
      title: results[0]?.title || 'indusmova',
      sources: sources.length ? sources : results.map((item, index) => ({ n: index + 1, title: item.title, url: item.url, cited: false })),
      provider: clean(data.provider || 'AI', 40),
      model: clean(data.model || '', 120),
    };
  } catch { return null; }
}

function renderCitations(answer, sourcePrefix) {
  return esc(answer).replace(/\[(\d{1,2})\]/g, (_match, number) =>
    `<a class="citation" href="#${sourcePrefix}-${Number(number)}" aria-label="Open source ${Number(number)}">[${Number(number)}]</a>`,
  ).replace(/\n/g, '<br>');
}

function renderUser(message, shouldStore = false) {
  const row = el('div', 'me');
  row.append(el('span', null, esc(message.text)));
  $('#thread').append(row);
  if (shouldStore) messages.push({ type: 'user', text: message.text });
}

function renderAnswer(answer, shouldStore = false) {
  const card = el('article', 'answer');
  const sourcePrefix = `answer-source-${++answerSequence}`;
  const providerLabel = answer.provider === 'source-excerpt' ? t('excerpt') : `${t('ai')} · ${answer.provider}`;
  card.append(el('p', 'from', `${esc(providerLabel)} <span>·</span> ${esc(answer.title)}`));
  card.append(el('h2', null, esc(answer.title || t('answer'))));
  if (answer.answer) card.append(el('p', 'lead', renderCitations(answer.answer, sourcePrefix)));

  if (answer.points?.length) {
    const list = el('ul', 'points');
    answer.points.forEach((point) => list.append(el('li', null, esc(point))));
    card.append(list);
  }
  if (answer.topics?.length) {
    const topicsBox = el('div', 'topics');
    answer.topics.forEach((item) => {
      const section = el('section');
      section.append(el('h3', null, esc(item.heading)));
      section.append(el('p', null, esc(item.line)));
      topicsBox.append(section);
    });
    card.append(topicsBox);
  }

  const sources = (answer.sources || []).filter((source) => source.url && safeWikiUrl(source.url));
  if (sources.length) {
    const sourceBox = el('div', 'source-list');
    sourceBox.append(el('h3', 'source-heading', t('sources')));
    sources.forEach((source) => {
      const row = el('a', 'source-row');
      row.id = `${sourcePrefix}-${Number(source.n) || 1}`;
      row.href = safeWikiUrl(source.url);
      row.target = '_blank';
      row.rel = 'noopener noreferrer';
      row.append(el('span', 'source-num', `[${Number(source.n) || 1}]`));
      row.append(el('span', 'source-title', esc(source.title)));
      row.append(el('span', 'source-open', '↗'));
      if (source.cited) row.classList.add('is-cited');
      sourceBox.append(row);
    });
    card.append(sourceBox);
  }

  const footer = el('div', 'foot');
  const copy = el('button', null, t('copy'));
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    const value = [answer.title, answer.answer, ...(answer.points || []), ...(answer.topics || []).map((item) => `${item.heading}: ${item.line}`), ...(sources.map((source) => `[${source.n}] ${source.title} — ${source.url}`))].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(value); copy.textContent = t('copied'); } catch { copy.textContent = t('copy'); }
  });
  footer.append(copy);

  const save = el('button', null, t('save'));
  save.type = 'button';
  save.addEventListener('click', () => {
    const exists = savedAnswers.some((item) => item.answer === answer.answer && item.title === answer.title);
    if (!exists) savedAnswers.unshift({ ...answer, savedAt: new Date().toISOString() });
    savedAnswers = savedAnswers.slice(0, 100);
    persist();
    save.textContent = t('saved');
  });
  footer.append(save);

  const speak = el('button', null, t('speak'));
  speak.type = 'button';
  speak.addEventListener('click', () => speakAnswer(answer.answer));
  footer.append(speak);
  card.append(footer);
  $('#thread').append(card);
  card.scrollIntoView({ block: 'nearest' });
  lastAnswerText = answer.answer || '';
  $('#speakBtn').hidden = !('speechSynthesis' in window) || !lastAnswerText;
  if (shouldStore) messages.push({ type: 'answer', data: answer });
}

function renderStoredMessages() {
  $('#thread').replaceChildren();
  setStopVisible(false);
  if (!messages.length) { hello(); return; }
  for (const message of messages) {
    if (message.type === 'user') renderUser(message);
    else if (message.type === 'answer' && message.data) renderAnswer(message.data);
  }
  // The dock's read-aloud button used to stay hidden after a reload, because
  // lastAnswerText was only set while rendering a fresh answer.
  const last = [...messages].reverse().find((message) => message.type === 'answer' && message.data?.answer);
  lastAnswerText = last?.data?.answer || '';
  $('#speakBtn').hidden = !('speechSynthesis' in window) || !lastAnswerText;
}

function hello() {
  const box = el('div', 'hello');
  box.append(el('h1', null, t('hello')));
  box.append(el('p', null, t('intro')));
  const grid = el('div', 'sugg');
  for (const suggestion of SUGGESTIONS[uiLang()] || SUGGESTIONS.en) {
    const button = el('button', null, esc(suggestion));
    button.type = 'button';
    button.addEventListener('click', () => ask(suggestion));
    grid.append(button);
  }
  box.append(grid);
  $('#thread').append(box);
}

function loadingCard() {
  const card = el('div', 'answer');
  const list = el('ol', 'steps');
  [t('search'), t('reading'), t('preparing')].forEach((label, index) => {
    const item = el('li', `step${index === 0 ? ' on' : ''}`);
    item.append(el('span', 'dot'));
    item.append(el('span', null, esc(label)));
    list.append(item);
  });
  card.append(list);
  $('#thread').append(card);
  card.scrollIntoView({ block: 'nearest' });
  return card;
}

function showFailure(message) {
  const box = el('div', 'oops');
  box.append(el('b', null, t('error')));
  box.append(el('p', null, esc(message || t('error'))));
  $('#thread').append(box);
}

async function ask(raw) {
  const question = clean(raw, 800);
  if (!question || busy) return;
  busy = true;
  $('#send').disabled = true;
  const welcome = $('#thread .hello');
  if (welcome) welcome.remove();
  renderUser({ text: question }, true);
  $('#thread').setAttribute('aria-busy', 'true');
  const progress = loadingCard();
  const depth = $('#answerDepth').value || 'detailed';
  const language = lang();
  const limit = depth === 'quick' ? 3 : depth === 'deep' ? 6 : 5;
  const query = topic && question.trim().split(/\s+/).length <= 3 ? `${topic} ${question}` : question;
  const controller = new AbortController();
  activeController = controller;
  setStopVisible(true);
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const results = await searchEntries(query, language, limit, controller.signal);
    if (!results.length) {
      progress.remove();
      showFailure(t('noResults'));
      return;
    }
    topic = results[0].title;
    const model = await askModel(question, results, depth, controller.signal);
    const topicLimit = depth === 'quick' ? 2 : depth === 'deep' ? 6 : 4;
    let topics = [];
    try { topics = await entryTopics(language, results[0].title, topicLimit, controller.signal); } catch { topics = []; }
    const answer = model
      ? { ...model, topics }
      : { ...composeExcerpt(results[0], question, topics), sources: results.map((item, index) => ({ n: index + 1, title: item.title, url: item.url, cited: index === 0 })) };
    progress.remove();
    renderAnswer(answer, true);
    if (!model) showFallbackNote();
  } catch (error) {
    progress.remove();
    showFailure(error?.name === 'AbortError' ? 'The request timed out. Please retry.' : t('error'));
  } finally {
    clearTimeout(timeout);
    busy = false;
    activeController = null;
    setStopVisible(false);
    $('#send').disabled = false;
    $('#thread').removeAttribute('aria-busy');
    persist();
    $('#prompt').focus();
  }
}

function showFallbackNote() {
  const note = el('p', 'fallback-note', t('fallback'));
  $('#thread').append(note);
}

function speakAnswer(value) {
  if (!('speechSynthesis' in window) || !value) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = SPEECH[lang()] || 'en-IN';
  utterance.rate = 0.98;
  isSpeaking = true;
  $('#speakBtn').textContent = t('stopSpeak');
  utterance.onend = utterance.onerror = () => {
    isSpeaking = false;
    $('#speakBtn').textContent = t('speak');
  };
  window.speechSynthesis.speak(utterance);
}

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showFailure(t('noSpeech')); return; }
  if (recognition) { recognition.stop(); recognition = null; return; }
  recognition = new SpeechRecognition();
  recognition.lang = SPEECH[lang()] || 'en-IN';
  recognition.interimResults = true;
  recognition.continuous = false;
  $('#voiceBtn').textContent = t('listening');
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ');
    $('#prompt').value = transcript;
    $('#prompt').dispatchEvent(new Event('input'));
  };
  recognition.onerror = () => { $('#voiceBtn').textContent = t('voice'); recognition = null; };
  recognition.onend = () => { $('#voiceBtn').textContent = t('voice'); recognition = null; };
  recognition.start();
}

function showSavedAnswers() {
  const thread = $('#thread');
  thread.replaceChildren();
  setStopVisible(false);
  // There used to be no route back: the only other control, "New chat",
  // wiped the conversation. This returns to it untouched.
  if (messages.length) {
    const back = el('button', 'back-btn', `← ${esc(t('back'))}`);
    back.type = 'button';
    back.addEventListener('click', () => renderStoredMessages());
    thread.append(back);
  }
  thread.append(el('div', 'hello', `<h1>${esc(t('savedTitle'))}</h1><p>${savedAnswers.length ? esc(t('savedOnDevice').replace('{count}', String(savedAnswers.length))) : esc(t('noSaved'))}</p>`));
  savedAnswers.forEach((answer) => {
    const card = el('article', 'answer');
    card.append(el('h2', null, esc(answer.title)));
    card.append(el('p', 'lead', esc(answer.answer)));
    (answer.sources || []).forEach((source) => {
      const url = safeWikiUrl(source.url);
      if (!url) return;
      const link = el('a', 'source', `${esc(source.title)} ↗`);
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      card.append(link);
    });
    const remove = el('button', null, t('remove'));
    remove.type = 'button';
    remove.addEventListener('click', () => { savedAnswers = savedAnswers.filter((item) => item !== answer); persist(); showSavedAnswers(); });
    card.append(remove);
    thread.append(card);
  });
}

function setStopVisible(visible) {
  const stop = $('#stopBtn');
  if (!stop) return;
  stop.hidden = !visible;
  stop.textContent = t('stop');
  $('#send').hidden = Boolean(visible);
}

function initStopControl() {
  const composer = $('#composer');
  if (!composer || $('#stopBtn')) return;
  const stop = el('button', 'stop-btn');
  stop.id = 'stopBtn';
  stop.type = 'button';
  stop.hidden = true;
  stop.textContent = t('stop');
  stop.setAttribute('aria-label', t('stop'));
  stop.addEventListener('click', () => {
    if (activeController) activeController.abort();
  });
  composer.insertBefore(stop, $('#send'));
}

function initConnectionState() {
  const strip = el('p', 'chat-offline');
  strip.id = 'chatOffline';
  strip.hidden = true;
  strip.setAttribute('role', 'status');
  strip.textContent = t('offline');
  $('.dock').insertBefore(strip, $('.composer'));
  const sync = () => {
    const offline = !navigator.onLine;
    strip.hidden = !offline;
    if (offline) $('#send').disabled = true;
    else if (!busy) $('#send').disabled = false;
  };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

function updateLanguageUI() {
  $('#prompt').placeholder = t('ask');
  const labels = $('.chat-tools').querySelectorAll('label');
  if (labels[0]?.firstChild) labels[0].firstChild.nodeValue = `${t('contentLanguage')} `;
  if (labels[1]?.firstChild) labels[1].firstChild.nodeValue = `${t('depth')} `;
  if (labels[2]?.firstChild) labels[2].firstChild.nodeValue = `${t('interfaceLanguage')} `;
  const depthOptions = $('#answerDepth').options;
  if (depthOptions[0]) depthOptions[0].textContent = t('quick');
  if (depthOptions[1]) depthOptions[1].textContent = t('detailed');
  if (depthOptions[2]) depthOptions[2].textContent = t('deep');
  $('#voiceBtn').textContent = t('voice');
  $('#speakBtn').textContent = t('speak');
  $('#newChat').textContent = t('newChat');
  $('#savedAnswersBtn').textContent = t('savedTitle');
  $('#privacyHint').textContent = t('hint');
}

$('#prompt').addEventListener('input', () => {
  const input = $('#prompt');
  input.style.height = 'auto';
  input.style.height = `${Math.min(160, input.scrollHeight)}px`;
});
$('#prompt').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  const input = $('#prompt');
  const value = input.value.trim();
  if (!value) return;
  input.value = ''; input.style.height = 'auto';
  ask(value);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activeController) { activeController.abort(); return; }
  if (event.key === '/' && !event.target.closest('input, textarea, select')) {
    event.preventDefault();
    $('#prompt').focus();
  }
});
$('#newChat').addEventListener('click', () => {
  messages = []; topic = ''; persist();
  renderStoredMessages();
  $('#prompt').focus();
});
$('#voiceBtn').addEventListener('click', startVoice);
$('#speakBtn').addEventListener('click', () => {
  if (isSpeaking) { window.speechSynthesis.cancel(); isSpeaking = false; $('#speakBtn').textContent = t('speak'); }
  else speakAnswer(lastAnswerText);
});
$('#savedAnswersBtn').addEventListener('click', showSavedAnswers);
$('#contentLanguage').addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:content-language', lang()); } catch { /* ignore */ }
});
$('#answerDepth').addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:depth', $('#answerDepth').value); } catch { /* ignore */ }
});
$('#uiLanguage').addEventListener('change', () => {
  try { localStorage.setItem('indusmova:chat:ui-language', uiLang()); } catch { /* ignore */ }
  updateLanguageUI();
  if (!messages.length) { $('#thread').replaceChildren(); hello(); }
});
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.querySelectorAll('meta[name="theme-color"]').forEach((node) => node.setAttribute('content', next === 'dark' ? '#0f1214' : '#fbf9f5'));
  try { localStorage.setItem('indusmova:theme', next); } catch { /* ignore */ }
});

try {
  const savedContent = localStorage.getItem('indusmova:chat:content-language');
  if (LANGS.includes(savedContent)) $('#contentLanguage').value = savedContent;
  else if (navigator.language?.toLowerCase().startsWith('hi')) $('#contentLanguage').value = 'hi';
  const savedUI = localStorage.getItem('indusmova:chat:ui-language');
  if (savedUI === 'hi' || savedUI === 'en') $('#uiLanguage').value = savedUI;
  const theme = localStorage.getItem('indusmova:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch { /* private browsing / storage disabled */ }

if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) $('#voiceBtn').hidden = false;
else $('#voiceBtn').hidden = true;
try {
  const savedDepth = localStorage.getItem('indusmova:chat:depth');
  if (['quick', 'detailed', 'deep'].includes(savedDepth)) $('#answerDepth').value = savedDepth;
} catch { /* storage blocked */ }

initStopControl();
initConnectionState();
updateLanguageUI();
renderStoredMessages();

// /chat/?q=… — the article pages and the home page link here, so a reader can
// go straight from an entry to a question about it.
const startQuestion = clean(new URLSearchParams(location.search).get('q') || '', 800);
if (startQuestion) {
  $('#prompt').value = startQuestion;
  ask(startQuestion);
  history.replaceState(null, '', location.pathname);
} else {
  $('#prompt').focus();
}
