/* Browser tests for interactions that the unit tests cannot reach.
 *
 * Two real defects found while auditing the whole repository, each pinned
 * here so it cannot quietly return:
 *
 *   1. Regenerate, in the chat, left the old question bubble on screen and
 *      printed a second identical one under it — the question appeared twice.
 *
 *   2. The view cache (which is what makes Back instant) also cached the
 *      Bookmarks list, so saving an article and pressing Back showed the old,
 *      empty list. A page built from local data has to be dropped when that
 *      data changes.
 *
 * Both need a real browser and a stubbed network, so they run under chromium
 * over the DevTools protocol. Run with:
 *   node scripts/interaction-check.mjs      (needs a server on :4173)
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const PORT = Number(process.env.CDP_PORT || 9250);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function articleBody(title) {
  return `<div class="mw-parser-output">
    <p><b>${title}</b> is a test subject with a lead paragraph long enough to be split into points by the builder here.</p>
    <h2><span class="mw-headline" id="History">History</span></h2>
    <p>The history section carries a second paragraph about dates and places worth reading.</p>
  </div>`;
}

function wikiPayload(url) {
  const u = new URL(url);
  const action = u.searchParams.get('action');
  if (action === 'parse') {
    const title = u.searchParams.get('page') || 'Test';
    return {
      parse: {
        title, pageid: 1, revid: 1, displaytitle: title, text: articleBody(title),
        sections: [{ anchor: 'History', line: 'History', level: '2', index: '1', number: '1' }],
        langlinks: [], images: [],
      },
    };
  }
  if (action === 'query') {
    if (u.searchParams.get('revids')) {
      return { query: { pages: [{ pageid: 1, revisions: [{ revid: 1, timestamp: '2026-11-01T10:00:00Z', user: 'T' }] }] } };
    }
    // The chat searches with generator=search and keeps only pages that carry
    // an `extract`; without one it finds no passages and renders no answer.
    const extract = 'An extract about the test page, long enough to be used as a passage when answering.';
    return {
      query: {
        pages: [{
          title: u.searchParams.get('titles') || 'Test page',
          pageimage: '',
          thumbnail: null,
          extract,
          fullurl: 'https://en.wikipedia.org/wiki/Test_page',
          pageid: 2,
        }],
      },
    };
  }
  return {};
}

const ANSWER = {
  answer: '## Topic\nThis is the answer body about the test page.\n\nMore detail [1].',
  sources: [{ n: 1, title: 'Test page', url: 'https://en.wikipedia.org/wiki/Test_page', cited: true }],
  provider: 'workers-ai',
  model: 'test',
};

const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) break;
  } catch { /* not up yet */ }
  await sleep(250);
}
if (!page) { chrome.kill(); throw new Error('chromium did not expose a page target'); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let id = 0;
const waiting = new Map();
const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const myId = ++id;
  waiting.set(myId, { res, rej });
  ws.send(JSON.stringify({ id: myId, method, params }));
});

ws.on('message', async (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && waiting.has(m.id)) {
    const { res, rej } = waiting.get(m.id);
    waiting.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0].slice(0, 160));
  }
  if (m.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = m.params;
  const url = request.url;
  let body = null;
  if (/wikipedia\.org\/w\/api\.php/.test(url)) body = JSON.stringify(wikiPayload(url));
  else if (/\/api\/ask/.test(url)) body = JSON.stringify(ANSWER);
  if (body != null) {
    await send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'content-type', value: 'application/json; charset=utf-8' },
        { name: 'access-control-allow-origin', value: '*' },
      ],
      body: Buffer.from(body).toString('base64'),
    }).catch(() => {});
    return;
  }
  await send('Fetch.continueRequest', { requestId }).catch(() => {});
});

const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Fetch.enable', {
  patterns: [
    { urlPattern: 'https://*.wikipedia.org/*', requestStage: 'Request' },
    { urlPattern: 'http://127.0.0.1:4173/api/*', requestStage: 'Request' },
  ],
});

const results = [];

/* ── 1. Regenerate must not duplicate the question ─────────────────────── */
await send('Page.navigate', { url: `${BASE}/chat/` }).catch(() => {});
await sleep(2500);
await ev(`(() => { const p = document.getElementById('prompt'); p.value = 'what is the test page'; document.getElementById('send').click(); })()`);
await sleep(3000);
const before = await ev(`({ q: document.querySelectorAll('#thread .q').length, a: document.querySelectorAll('#thread .a').length })`);
await ev(`(() => { const b = [...document.querySelectorAll('.a-actions button')].find(x => /Regenerate/i.test(x.textContent)); b && b.click(); })()`);
await sleep(3000);
const after = await ev(`({ q: document.querySelectorAll('#thread .q').length, a: document.querySelectorAll('#thread .a').length })`);
results.push(['regenerate: question bubbles', `${before.q} -> ${after.q}`, before.q === 1 && after.q === 1 ? 'PASS' : 'FAIL']);
results.push(['regenerate: one answer', `${before.a} -> ${after.a}`, after.a === 1 ? 'PASS' : 'FAIL']);

/* ── 2. Bookmarks must not come back stale from the view cache ─────────── */
// The chat is a page of its own with no hash router, so this half has to load
// the app shell first — setting a hash on /chat/ would navigate nowhere.
await send('Page.navigate', { url: `${BASE}/#/bookmarks` }).catch(() => {});
await sleep(2000);
await ev(`localStorage.clear()`).catch(() => {});
await ev(`location.hash = '#/bookmarks'`);
await sleep(1500);
const emptyCount = await ev(`document.querySelectorAll('.saved-item').length`);
await ev(`location.hash = '#/article/Test_page'`);
await sleep(1800);
await ev(`(() => { const b = [...document.querySelectorAll('.art-actions button')].find(x => /Bookmark/i.test(x.textContent)); b && b.click(); })()`);
await sleep(600);
await ev(`history.back()`);
await sleep(1500);
const afterCount = await ev(`document.querySelectorAll('.saved-item').length`);
results.push(['bookmarks after Back', `${emptyCount} -> ${afterCount}`, afterCount === 1 ? 'PASS' : 'FAIL']);

results.push(['runtime errors', String(errors.length), errors.length === 0 ? 'PASS' : 'FAIL']);

const failed = results.filter((r) => r[2] === 'FAIL');
for (const [label, detail, verdict] of results) console.log(`${label.padEnd(30)} ${detail.padEnd(14)} ${verdict}`);
if (failed.length) console.log('\nFAILED:', failed.map((r) => r[0]).join(', '));

ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
