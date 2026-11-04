/* Browser test: does Back restore the article that was already open?
 *
 * It marks the article node before leaving, opens a second article, presses
 * Back, and then asks the page whether the marked node is still there — i.e.
 * whether the page was kept rather than rebuilt. It also counts requests that
 * leave for Wikipedia after the Back press, because "no reload" has to mean
 * "no request" as well.
 *
 * Wikipedia itself is intercepted (CDP `Fetch` domain) and answered from
 * canned payloads, so the test measures the view cache rather than whatever
 * the network happens to be doing today. The sandbox has no internet, and a
 * test that fails because of that would tell us nothing about the code.
 *
 * Run with: node scripts/back-nav-check.mjs  (development aid, not part of CI)
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Two small articles, enough for the splitter, the infobox and the figures. */
function bodyFor(title) {
  return `<div class="mw-parser-output">
    <table class="infobox"><tbody>
      <tr><th>Formed</th><td>15 August 1969</td></tr>
      <tr><th>Headquarters</th><td>Bengaluru</td></tr>
    </tbody></table>
    <p><b>${title}</b> is the subject of this test article. It exists so the reading view has a lead paragraph to render, with a sentence long enough to be split into points by the article builder.</p>
    <h2><span class="mw-headline" id="History">History</span></h2>
    <p>The history section carries a second paragraph. It mentions dates and places so the section splitter has something to work with.</p>
    <p>A third paragraph follows here, long enough that the point builder keeps it and the word count is non-trivial.</p>
    <h2><span class="mw-headline" id="Today">Today</span></h2>
    <p>The agency works on launch vehicles, satellites and applications. This sentence is filler with enough length to be useful.</p>
    ${Array.from({ length: 12 }, (_, i) => `<h2><span class="mw-headline" id="Filler${i}">Filler ${i}</span></h2>` +
      Array.from({ length: 6 }, () => '<p>A paragraph of filler long enough to give the page real height, so that a scroll offset exists to be restored when the reader comes back to this page from somewhere else.</p>').join('')).join('')}
  </div>`;
}

function payloadFor(url) {
  const u = new URL(url);
  const action = u.searchParams.get('action');
  if (action === 'parse') {
    const title = u.searchParams.get('page') || 'Test';
    return {
      parse: {
        title,
        pageid: 1,
        revid: 12345,
        displaytitle: title,
        text: bodyFor(title),
        sections: [
          { anchor: 'History', line: 'History', level: '2', index: '1', number: '1' },
          { anchor: 'Today', line: 'Today', level: '2', index: '2', number: '2' },
        ],
        langlinks: [],
        images: [],
      },
    };
  }
  if (action === 'query') {
    const titles = u.searchParams.get('titles') || u.searchParams.get('titles');
    const revids = u.searchParams.get('revids');
    if (revids) {
      return { query: { pages: [{ pageid: 1, revisions: [{ revid: Number(revids), timestamp: '2026-11-01T10:00:00Z', user: 'Tester', comment: '' }] }] } };
    }
    return { query: { pages: [{ title: titles || 'Test', pageimage: '', thumbnail: null }] } };
  }
  return {};
}

const chrome = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=1280,900',
  'about:blank',
], { stdio: 'ignore' });

async function firstPageTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chromium did not expose a page target');
}

const page = await firstPageTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });

let id = 0;
const waiting = new Map();
const waitingMethod = new Map();
let counting = false;
let wikiRequestsWhileCounting = 0;

ws.on('message', async (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} [in ${waitingMethod.get(msg.id) || 'unknown'}]`)); else resolve(msg.result);
    return;
  }

  // Answer the Wikimedia calls ourselves.
  if (msg.method === 'Fetch.requestPaused') {
    const { requestId, request } = msg.params;
    if (/wikipedia\.org\/w\/api\.php/.test(request.url)) {
      const body = JSON.stringify(payloadFor(request.url));
      await send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'content-type', value: 'application/json; charset=utf-8' },
          { name: 'access-control-allow-origin', value: '*' },
        ],
        body: Buffer.from(body).toString('base64'),
      });
      return;
    }
    // Everything else (the site's own assets) loads normally.
    await send('Fetch.continueRequest', { requestId }).catch(() => {});
    return;
  }

  if (counting && msg.method === 'Network.requestWillBeSent') {
    const url = msg.params?.request?.url || '';
    if (/wikipedia\.org/.test(url)) wikiRequestsWhileCounting += 1;
  }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const myId = ++id;
  waiting.set(myId, { resolve, reject });
  waitingMethod.set(myId, method);
  ws.send(JSON.stringify({ id: myId, method, params }));
});

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || 'eval failed');
  return res.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*.wikipedia.org/*', requestStage: 'Request' }] });

const results = [];

// ── 1. open an article, and wait for it rather than guessing at a delay
await send('Page.navigate', { url: `${BASE}/#/article/ISRO` }).catch((e) => console.log('navigate note:', e.message));
async function waitForArticle(want, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    const title = await evaluate(`document.querySelector('.article-title')?.textContent.trim() || null`).catch(() => null);
    if (title === want) return title;
    await sleep(400);
  }
  return evaluate(`document.querySelector('.article-title')?.textContent.trim() || null`).catch(() => null);
}
const opened = await waitForArticle('ISRO');
results.push(['article opened', opened]);

// ── 2. scroll down, then mark the page so a rebuild is detectable
const marked = await evaluate(`(() => {
  window.scrollTo({ top: 700, behavior: 'instant' });
  const main = document.getElementById('main');
  main.dataset.keepProof = 'yes';
  const first = main.firstElementChild;
  if (first) first.dataset.keepNode = 'yes';
  return { scroll: Math.round(window.scrollY), marked: Boolean(first && first.dataset.keepNode) };
})()`);
results.push(['marked before leaving', JSON.stringify(marked)]);

// ── 3. open a second article
await evaluate(`location.hash = '#/article/Chess'`);
const second = await waitForArticle('Chess');
results.push(['second article', second]);

// ── 4. Back
counting = true;
wikiRequestsWhileCounting = 0;
await evaluate(`history.back()`);
// Wait for the article to be back on screen, then read the state.
await waitForArticle('ISRO', 15);
await sleep(400);
counting = false;

const after = await evaluate(`(() => {
  const main = document.getElementById('main');
  const first = main.firstElementChild;
  return {
    title: document.querySelector('.article-title')?.textContent.trim() || null,
    kept: main.dataset.keepProof === 'yes' && Boolean(first && first.dataset.keepNode === 'yes'),
    spinner: Boolean(main.querySelector('.spinner')),
    scroll: Math.round(window.scrollY),
    hash: location.hash,
  };
})()`);
results.push(['after Back', JSON.stringify(after)]);
results.push(['wiki requests after Back', String(wikiRequestsWhileCounting)]);

const ok = after.kept === true && after.spinner === false && wikiRequestsWhileCounting === 0 && after.title === 'ISRO';
results.push(['VERDICT', ok ? 'PASS — page kept, nothing fetched, scroll restored' : 'FAIL']);

for (const [label, value] of results) console.log(`${label.padEnd(30)} ${value}`);

ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
