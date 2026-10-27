/* Browser-only IndusMova source finder widget. No backend, API key, or AI-generation endpoint. */
import { searchPublicSources, cleanText } from './research-core.js';

const script = document.currentScript;
const currentScriptUrl = import.meta.url;
const rootUrl = new URL('../css/chat-widget.css', currentScriptUrl).href;
const STORE = 'indusmova:public-research:v3:widget';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (value) => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
function svg(name) {
  const paths = {
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bookmark: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.7L6 21Z"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.search}</svg>`;
}
function readSaved() { try { const value = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function saveSaved(items) { try { localStorage.setItem(STORE, JSON.stringify(items.slice(0, 30))); } catch { /* widget remains usable for this session */ } }
function ensureStyle() {
  if ([...document.styleSheets].some((sheet) => sheet.href === rootUrl)) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = rootUrl; document.head.append(link);
}
function createWidget() {
  if (document.querySelector('[data-indusmova-source-widget]')) return;
  ensureStyle();
  const mount = document.createElement('div');
  mount.className = 'im-source-widget';
  mount.dataset.indusmovaSourceWidget = 'true';
  mount.innerHTML = `
    <button class="imw-launcher" type="button" data-imw="open" aria-expanded="false" aria-label="Open IndusMova source finder"><span class="imw-launcher-mark">${svg('search')}</span><span>Explore sources</span></button>
    <section class="imw-panel" role="dialog" aria-modal="false" aria-label="IndusMova source finder" hidden>
      <header class="imw-header"><span class="imw-brand-mark">${svg('search')}</span><div class="imw-brand"><strong>indusmova<span>.</span></strong><small>PUBLIC-SOURCE FINDER</small></div><span class="imw-status"><i></i> No AI</span><button type="button" class="imw-icon" data-imw="close" aria-label="Close source finder">${svg('close')}</button></header>
      <div class="imw-intro"><div class="imw-kicker">SEARCH · INSPECT · SAVE</div><h2>Find the source.<br><em>Read the evidence.</em></h2><p>Search Wikipedia articles and inspect original excerpts. This tool does not generate answers.</p></div>
      <form class="imw-form"><label class="imw-searchbox">${svg('search')}<input name="query" maxlength="300" placeholder="Search a topic or question…" aria-label="Search Wikipedia" required><button type="button" data-imw="clear" aria-label="Clear query" hidden>×</button></label><div class="imw-controls"><label>Language<select name="language"><option value="en">English</option><option value="hi">हिन्दी</option><option value="bn">বাংলা</option><option value="ta">தமிழ்</option><option value="te">తెలుగు</option><option value="mr">मराठी</option><option value="gu">ગુજરાતી</option><option value="kn">ಕನ್ನಡ</option><option value="ml">മലയാളം</option><option value="pa">ਪੰਜਾਬੀ</option><option value="ur">اردو</option><option value="sa">संस्कृतम्</option></select></label><label>Results<select name="limit"><option value="3">3 sources</option><option value="5" selected>5 sources</option><option value="10">10 sources</option></select></label><button class="imw-submit" type="submit">Search ↗</button></div></form>
      <div class="imw-state" data-imw-state><span class="imw-state-icon">${svg('search')}</span><strong>Ready to search</strong><p>Results come directly from Wikipedia's public API. No sign-in or API key required.</p></div>
      <div class="imw-results" data-imw-results hidden></div>
      <footer class="imw-footer"><span>Query goes to Wikipedia</span><a href="https://indusmova.pages.dev/" target="_blank" rel="noopener noreferrer">Visit IndusMova ↗</a></footer>
    </section>`;
  document.body.append(mount);
  const panel = mount.querySelector('.imw-panel');
  const launcher = mount.querySelector('.imw-launcher');
  const form = mount.querySelector('.imw-form');
  const input = form.elements.query;
  const state = mount.querySelector('[data-imw-state]');
  const results = mount.querySelector('[data-imw-results]');
  const openPanel = () => { panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); input.focus(); };
  const closePanel = () => { panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); launcher.focus(); };
  let controller = null;
  const status = (title, detail, busy = false) => {
    state.hidden = false; results.hidden = true;
    state.innerHTML = `<span class="imw-state-icon ${busy ? 'is-busy' : ''}">${svg('search')}</span><strong>${esc(title)}</strong><p>${esc(detail)}</p>${busy ? '<button type="button" data-imw="stop">Cancel search</button>' : ''}`;
  };
  const saved = readSaved();
  const showResults = (sources) => {
    state.hidden = true; results.hidden = false;
    results.innerHTML = sources.length ? `<div class="imw-result-head"><strong>${sources.length} public source${sources.length === 1 ? '' : 's'}</strong><span>Wikipedia search results</span></div>${sources.map((source, i) => {
      const url = safeUrl(source.url);
      const key = url;
      const isSaved = saved.some((item) => item.url === key);
      return `<article class="imw-result"><div class="imw-result-num">${String(i + 1).padStart(2, '0')}</div><div class="imw-result-copy"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ${svg('external')}</a><p>${esc(source.snippet || source.extract || 'Open the original article to read more.')}</p><div class="imw-result-actions"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a><button type="button" data-imw-save="${esc(key)}">${isSaved ? '✓ Saved' : '+ Save'}</button></div></div></article>`;
    }).join('')}` : `<div class="imw-empty"><strong>No matching articles</strong><p>Try a different keyword, or switch the article language.</p></div>`;
  };
  mount.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-imw]')?.dataset.imw;
    if (action === 'open') openPanel();
    if (action === 'close') closePanel();
    if (action === 'clear') { input.value = ''; mount.querySelector('[data-imw="clear"]').hidden = true; input.focus(); }
    if (action === 'stop') controller?.abort();
    const saveButton = event.target.closest('[data-imw-save]');
    if (saveButton) {
      const key = saveButton.dataset.imwSave;
      const source = mount._sources?.find((item) => item.url === key);
      if (!source) return;
      const index = saved.findIndex((item) => item.url === key);
      if (index >= 0) { saved.splice(index, 1); saveButton.textContent = '+ Save'; }
      else { saved.unshift({ title: source.title, url: source.url, snippet: source.snippet, language: source.language }); saveSaved(saved); saveButton.textContent = '✓ Saved'; }
      saveSaved(saved);
    }
  });
  input.addEventListener('input', () => { mount.querySelector('[data-imw="clear"]').hidden = !input.value; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = cleanText(input.value, 300);
    if (!query) return;
    controller?.abort(); controller = new AbortController();
    status('Searching Wikipedia…', 'Retrieving article titles and source excerpts directly from the public API. No answer is being generated.', true);
    try {
      const response = await searchPublicSources({ query, language: form.elements.language.value, limit: Number(form.elements.limit.value), signal: controller.signal });
      if (controller.signal.aborted) return;
      mount._sources = response.sources;
      showResults(response.sources);
    } catch (error) {
      if (error?.name === 'AbortError') { status('Search cancelled', 'The request was stopped.'); return; }
      status('Could not reach Wikipedia', `${error.message || 'Network error.'} Check your internet connection and retry.`);
    }
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) closePanel(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createWidget, { once: true }); else createWidget();
