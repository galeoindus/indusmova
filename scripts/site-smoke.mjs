/* Site smoke test: every route and every standalone page, in a real browser.
 *
 * Opens each view, records whether it rendered anything and whether the
 * console or an uncaught exception reported a problem. The Wikimedia API is
 * answered from canned payloads, so this measures the site's own code rather
 * than the network.
 *
 *   node scripts/site-smoke.mjs        (needs a server on :4173)
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const PORT = Number(process.env.CDP_PORT || 9260);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function articleBody(title) {
  return `<div class="mw-parser-output">
    <table class="infobox"><tbody><tr><th>Formed</th><td>1969</td></tr></tbody></table>
    <p><b>${title}</b> is a test subject with a lead paragraph long enough to be split into points by the builder here.</p>
    <h2><span class="mw-headline" id="History">History</span></h2>
    <p>The history section carries a second paragraph about dates and places worth reading.</p>
  </div>`;
}

function payload(url) {
  const u = new URL(url);
  const action = u.searchParams.get('action');
  const list = u.searchParams.get('list');
  if (action === 'parse') {
    const title = u.searchParams.get('page') || 'Test';
    return {
      parse: {
        title, pageid: 1, revid: 1, displaytitle: title, text: articleBody(title),
        sections: [{ anchor: 'History', line: 'History', level: '2', index: '1', number: '1' }],
        langlinks: [{ lang: 'hi', title: 'परीक्षण' }], images: [],
      },
    };
  }
  if (list === 'search') {
    return { query: { search: [{ title: 'Test page', snippet: 'A snippet for testing.', wordcount: 120, timestamp: '2026-11-01T00:00:00Z' }] } };
  }
  if (action === 'query') {
    if (u.searchParams.get('revids')) {
      return { query: { pages: [{ pageid: 1, revisions: [{ revid: 1, timestamp: '2026-11-01T10:00:00Z', user: 'T' }] }] } };
    }
    const generator = u.searchParams.get('generator');
    const page = {
      title: 'Test page', pageid: 2, pageimage: '', thumbnail: null,
      extract: 'An extract about the test page, long enough to be used as a passage.',
      fullurl: 'https://en.wikipedia.org/wiki/Test_page',
    };
    if (generator) return { query: { pages: [page] } };
    return { query: { pages: [page] } };
  }
  if (action === 'opensearch') return ['test', ['Test page'], [''], ['https://en.wikipedia.org/wiki/Test_page']];
  return {};
}

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
let errors = [];
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
    errors.push(`EXC ${(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0].slice(0, 160)}`);
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push(`LOG ${m.params.entry.text.slice(0, 160)}`);
  }
  if (m.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = m.params;
  const url = request.url;
  let body = null;
  if (/wikipedia\.org\/w\/api\.php/.test(url)) body = JSON.stringify(payload(url));
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
  if (r.exceptionDetails) return `EVALERR ${(r.exceptionDetails.exception?.description || '').split('\n')[0]}`;
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Fetch.enable', {
  patterns: [
    { urlPattern: 'https://*.wikipedia.org/*', requestStage: 'Request' },
    { urlPattern: 'https://www.wikidata.org/*', requestStage: 'Request' },
  ],
});

const routes = [
  '#/', '#/explore', '#/today', '#/bookmarks', '#/history', '#/sources', '#/topics',
  '#/library', '#/search?q=test', '#/ask?q=test', '#/article/Test_page',
  '#/about', '#/privacy', '#/terms', '#/accessibility', '#/support', '#/feedback',
  '#/nonsense-route',
];

await send('Page.navigate', { url: `${BASE}/` }).catch(() => {});
await sleep(2800);

const rows = [];
for (const route of routes) {
  errors = [];
  await ev(`location.hash = ${JSON.stringify(route)}`);
  await sleep(1300);
  const info = await ev(`(() => {
    const main = document.getElementById('main');
    return {
      view: document.documentElement.getAttribute('data-view'),
      len: main ? main.textContent.trim().length : 0,
    };
  })()`);
  const bad = errors.filter((e) => !/favicon/i.test(e));
  rows.push({ route, view: info.view, len: info.len, errors: bad });
}

const pages = ['/', '/chat/', '/research/', '/topics/', '/questions/', '/help/', '/how-it-works/', '/articles/', '/articles/ISRO/', '/404.html'];
for (const path of pages) {
  errors = [];
  await send('Page.navigate', { url: `${BASE}${path}` }).catch(() => {});
  await sleep(2200);
  const info = await ev(`({ len: document.body.textContent.trim().length, title: document.title })`);
  const bad = errors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
  rows.push({ route: path, view: 'page', len: info.len, errors: bad });
}

let failures = 0;
for (const row of rows) {
  const empty = row.len < 60;
  const bad = row.errors.length > 0;
  if (empty || bad) failures += 1;
  const flag = empty ? 'EMPTY' : bad ? 'ERROR' : 'ok';
  console.log(`${row.route.padEnd(26)} ${String(row.view || '').padEnd(13)} len=${String(row.len).padEnd(6)} ${flag}${bad ? ' -> ' + row.errors.slice(0, 2).join(' | ') : ''}`);
}

console.log(`\n${rows.length} views checked, ${failures} problem(s).`);
ws.close();
chrome.kill();
process.exit(failures ? 1 : 0);
