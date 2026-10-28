import { searchPublicSources, formatCitation, sourceMarkdown, cleanText } from './research-core.js';
import { answerFor, toMarkdown } from './research-answer.js';

(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORE = 'indusmova:public-research:v3';
  const PREFS = `${STORE}:prefs`;
  const MAX_HISTORY = 80;
  const MAX_SAVED = 100;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeUrl = (value) => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const idFor = (source) => safeUrl(source?.url) || `${source?.language || 'en'}:${source?.title || ''}`;
  const icons = {
    search: '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.7L6 21Z"/></svg>',
    external: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1.5 1.5 0 0 0-1.5-1.5h-9A1.5 1.5 0 0 0 4 5v9A1.5 1.5 0 0 0 5.5 15H8"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22Z"/><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20"/></svg>',
    compare: '<svg viewBox="0 0 24 24"><path d="M4 4h6v16H4zM14 4h6v16h-6zM10 8h4M10 16h4"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>',
  };

  const app = $('#research-app');
  const workspace = $('#workspace');
  const queryInput = $('[data-query-input]');
  const searchForm = $('[data-search-form]');
  const resultsView = $('[data-results-view]');
  const resultsList = $('[data-results-list]');
  const answerSlot = $('[data-answer-slot]');
  let currentAnswer = null;
  const welcome = $('[data-welcome]');
  const libraryView = $('[data-library-view]');
  const historyView = $('[data-history-view]');
  const toast = $('[data-toast]');
  const scrim = $('[data-scrim]');
  const modalBackdrop = $('[data-modal-backdrop]');
  const modalBody = $('[data-modal-body]');
  const langControl = $('[data-language]');
  const mobileLangControl = $('[data-language-mobile]');
  const resultsLangControl = $('[data-language-results]');
  const mobileLimitControl = $('[data-limit-mobile]');
  const resultsLimitControl = $('[data-limit-results]');
  const sortControl = $('[data-sort]');
  const limitButtons = $$('[data-limit]');
  let savedSearches = safeRead(STORE, { searches: [], savedSources: [] });
  if (!savedSearches || !Array.isArray(savedSearches.searches) || !Array.isArray(savedSearches.savedSources)) savedSearches = { searches: [], savedSources: [] };
  savedSearches.searches = savedSearches.searches.filter((x) => x && typeof x.query === 'string').slice(0, MAX_HISTORY);
  savedSearches.savedSources = savedSearches.savedSources.filter((x) => x && typeof x.title === 'string' && safeUrl(x.url)).slice(0, MAX_SAVED);
  const storedPrefs = safeRead(PREFS, {});
  const defaultLanguage = navigator.language?.slice(0, 2).toLowerCase() === 'hi' ? 'hi' : 'en';
  const prefs = {
    language: validLanguage(storedPrefs.language) ? storedPrefs.language : defaultLanguage,
    limit: [3, 5, 10].includes(Number(storedPrefs.limit)) ? Number(storedPrefs.limit) : 5,
    theme: storedPrefs.theme === 'dark' ? 'dark' : 'light',
  };
  let view = 'search';
  let currentQuery = '';
  let currentResults = [];
  let sourceOrder = [];
  let resultView = 'cards';
  let selected = new Set();
  let pending = false;
  let requestController = null;
  let toastTimer;
  let lastFocus = null;

  function safeRead(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
    catch { return fallback; }
  }
  function validLanguage(value) { return ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'sa'].includes(value); }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(savedSearches)); }
    catch { toastMessage('Browser storage is full. Some recent-search history could not be saved.'); }
  }
  function persistPrefs() { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* Private mode: preferences remain for this session. */ } }
  function toastMessage(message) {
    toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }
  function saveTheme(theme) {
    prefs.theme = theme === 'dark' ? 'dark' : 'light';
    app.dataset.theme = prefs.theme;
    const icon = $('[data-theme-icon]');
    icon.innerHTML = prefs.theme === 'dark' ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>' : '<path d="M20.5 15.4A8.5 8.5 0 0 1 8.6 3.5 8.5 8.5 0 1 0 20.5 15.4Z"/>';
    persistPrefs();
  }
  function setLimit(value) {
    prefs.limit = Number(value) || 5;
    limitButtons.forEach((button) => button.classList.toggle('is-active', Number(button.dataset.limit) === prefs.limit));
    if (mobileLimitControl) mobileLimitControl.value = String(prefs.limit);
    if (resultsLimitControl) resultsLimitControl.value = String(prefs.limit);
    persistPrefs();
  }
  function setView(next) {
    view = next;
    welcome.hidden = next !== 'search' || Boolean(currentResults.length || currentQuery);
    resultsView.hidden = next !== 'search' || !currentQuery;
    libraryView.hidden = next !== 'saved';
    historyView.hidden = next !== 'history';
    $$('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === next));
    renderLeftList();
    workspace.classList.remove('mobile-nav-open');
    scrim.hidden = true;
    if (next === 'saved') renderLibrary();
    if (next === 'history') renderHistoryPage();
  }
  function showHome() {
    currentQuery = ''; currentResults = []; selected.clear();
    welcome.hidden = false; resultsView.hidden = true; libraryView.hidden = true; historyView.hidden = true;
    view = 'search';
    $$('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === 'search'));
    renderSelectedPanel(); renderLeftList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    queryInput.focus({ preventScroll: true });
  }
  function saveSearch(query, language, count, timestamp) {
    const existing = savedSearches.searches.filter((x) => !(x.query.toLowerCase() === query.toLowerCase() && x.language === language));
    savedSearches.searches = [{ query, language, count, timestamp }, ...existing].slice(0, MAX_HISTORY);
    persist(); renderLeftList();
  }
  function relativeDate(timestamp) {
    const date = new Date(timestamp || 0);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function renderLeftList() {
    const list = $('[data-left-list]');
    const isSaved = view === 'saved';
    $('[data-left-list-title]').textContent = isSaved ? 'SAVED SOURCES' : view === 'history' ? 'RECENT SEARCHES' : 'RECENT TOPICS';
    if (isSaved) {
      const items = savedSearches.savedSources.slice(0, 8);
      list.innerHTML = items.length ? items.map((s) => `<button class="rail-topic" type="button" data-open-saved="${esc(idFor(s))}" title="Open ${esc(s.title)}"><span>${icons.bookmark}</span><span>${esc(s.title)}</span></button>`).join('') : '<div class="rail-empty">Saved articles will appear here.</div>';
    } else {
      const rows = savedSearches.searches.slice(0, 8);
      list.innerHTML = rows.length ? rows.map((s) => `<button class="rail-topic" type="button" data-repeat-search="${esc(s.query)}" data-repeat-language="${esc(s.language)}" title="Search again: ${esc(s.query)}"><span>${icons.search}</span><span>${esc(s.query)}</span></button>`).join('') : '<div class="rail-empty">Your searches will appear here.</div>';
    }
    $('[data-saved-count]').textContent = String(savedSearches.savedSources.length);
  }
  function highlightSnippet(text) {
    const safe = esc(text || 'No search snippet was returned for this article.');
    const words = currentQuery.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter((word) => word.length >= 3).slice(0, 5);
    if (!words.length) return safe;
    try { return safe.replace(new RegExp(`(${words.join('|')})`, 'giu'), '<mark>$1</mark>'); }
    catch { return safe; }
  }
  function formatWordCount(count) { return Number.isFinite(Number(count)) && Number(count) > 0 ? `${Number(count).toLocaleString()} words` : 'Article'; }
  function resultCard(source, index, { saved = false, compact = false } = {}) {
    const key = idFor(source);
    const isSaved = savedSearches.savedSources.some((s) => idFor(s) === key);
    const isSelected = selected.has(key);
    const number = index + 1;
    const safeHref = safeUrl(source.url);
    const displaySource = source.sourceName || 'Wikipedia';
    const snippet = source.snippet || source.extract || 'No excerpt is available. Open the original source for the full article.';
    const updated = source.lastUpdated ? new Date(source.lastUpdated) : null;
    const updatedText = updated && !Number.isNaN(updated.getTime()) ? `Updated ${updated.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}` : '';
    return `<article class="source-card${isSelected ? ' is-selected' : ''}" data-card-key="${esc(key)}">
      <div class="source-card-top"><span class="source-number">${String(number).padStart(2, '0')}</span><div class="source-title-block"><a class="source-title" href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a><div class="source-domain"><span class="domain-favicon">W</span><span>${esc(displaySource)} · ${esc(String(source.language || prefs.language).toUpperCase())}</span></div></div>
      <div class="source-top-actions"><button class="tiny-action${isSaved ? ' is-saved' : ''}" data-toggle-save="${esc(key)}" type="button" title="${isSaved ? 'Remove from reading list' : 'Save to reading list'}" aria-label="${isSaved ? 'Remove from reading list' : 'Save to reading list'}">${icons.bookmark}</button><button class="tiny-action" data-copy-source="${esc(key)}" type="button" title="Copy citation" aria-label="Copy citation">${icons.copy}</button></div></div>
      <p class="source-excerpt">${highlightSnippet(snippet)}</p>
      ${!compact ? `<details class="source-intro"><summary>Read article lead excerpt</summary><p>${esc(source.extract || snippet)}</p></details>` : ''}
      <div class="source-card-bottom"><div class="source-meta"><span>${icons.book} ${esc(formatWordCount(source.wordCount))}</span>${updatedText ? `<span>${icons.clock} ${esc(updatedText)}</span>` : ''}</div>
      ${!saved ? `<label class="select-source"><input type="checkbox" data-select-source="${esc(key)}" ${isSelected ? 'checked' : ''} aria-label="Select ${esc(source.title)} for comparison"><span>Compare</span></label>` : ''}
      <div class="result-actions"><a class="result-action" href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">${icons.external}<span>Open source</span></a><button class="result-action" data-export-source="${esc(key)}" type="button">${icons.download}<span>Export</span></button></div></div>
    </article>`;
  }
  function renderAnswer() {
    if (!answerSlot) return;
    if (!currentAnswer) { answerSlot.innerHTML = ''; answerSlot.hidden = true; return; }
    const a = currentAnswer;
    const esc2 = esc;
    answerSlot.hidden = false;
    answerSlot.innerHTML = `<article class="answer-card">
      <header class="answer-head"><span class="answer-mark">${icons.book}</span><div><span class="answer-eyebrow">ANSWER</span><h2>${esc2(a.title)}</h2></div></header>
      <p class="answer-lead">${esc2(a.answer)}</p>
      ${a.points.length ? `<ul class="answer-points">${a.points.map((x) => `<li>${esc2(x)}</li>`).join('')}</ul>` : ''}
      ${a.topics.length ? `<div class="answer-topics">${a.topics.map((t) => `<section><h3>${esc2(t.heading)}</h3><p>${esc2(t.line)}</p></section>`).join('')}</div>` : ''}
      <footer class="answer-foot"><span class="answer-source">From <a href="${esc2(a.source?.url || '#')}" target="_blank" rel="noopener noreferrer">${esc2(a.title)}</a> · Wikipedia</span>
      <button class="outline-button" type="button" data-toggle-markdown>Markdown</button></footer>
      <pre class="answer-md" hidden></pre>
    </article>`;
    const pre = answerSlot.querySelector('.answer-md');
    const btn = answerSlot.querySelector('[data-toggle-markdown]');
    btn?.addEventListener('click', () => {
      if (!pre.textContent) pre.textContent = toMarkdown(a);
      pre.hidden = !pre.hidden;
      btn.classList.toggle('is-on', !pre.hidden);
    });
  }
  function renderResults() {
    resultsView.classList.toggle('is-compact', resultView === 'compact');
    renderAnswer();
    $('[data-current-query]').textContent = currentQuery;
    $('[data-results-heading]').textContent = `Search results`;
    $('[data-results-subtitle]').textContent = `Articles matching “${currentQuery}”, with the answer taken from the first of them.`;
    $('[data-results-count]').textContent = `${currentResults.length} source${currentResults.length === 1 ? '' : 's'}`;
    $$('[data-result-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.resultView === resultView));
    $('[data-selection-toolbar]').hidden = selected.size === 0;
    const countNode = $('[data-selected-count]'); if (countNode) countNode.textContent = String(selected.size);
    if (!currentResults.length) {
      resultsList.innerHTML = `<div class="no-results"><span class="no-results-icon">${icons.search}</span><h3>No matching articles found</h3><p>Wikipedia did not return results for this search in ${esc(langName(prefs.language))}. Try a shorter topic, a person's full name, or switch the article language.</p><button type="button" data-action="retry">Try this search again ↗</button></div>`;
    } else {
      resultsList.innerHTML = currentResults.map((source, i) => resultCard(source, i, { compact: resultView === 'compact' })).join('');
    }
    renderSelectedPanel();
  }
  function langName(code) {
    const option = [...langControl.options].find((x) => x.value === code);
    return option?.textContent || code;
  }
  function sortedSources(items) {
    const copy = [...items];
    const sort = sortControl.value;
    if (sort === 'title') copy.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'longest') copy.sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0));
    else if (sort === 'recent') copy.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
    const keys = new Set(copy.map(idFor));
    // Keep selection order derived from the results; the sort option only changes the visible order.
    return copy;
  }
  function applySort() {
    currentResults = sortedSources(sourceOrder.length ? sourceOrder : currentResults);
    renderResults();
  }
  function renderSelectedPanel() {
    const list = $('[data-selected-list]');
    const items = currentResults.filter((source) => selected.has(idFor(source)));
    $('[data-selected-panel-count]').textContent = String(items.length);
    $$('[data-action="compare"]').forEach((button) => { button.disabled = items.length < 2; });
    $('[data-action="clear-selection"]').hidden = !items.length;
    if (!items.length) {
      list.innerHTML = `<div class="selected-empty"><span class="selected-empty-icon">${icons.bookmark}</span><strong>No sources selected</strong><small>Use the checkbox on a result to add it here.</small></div>`;
      return;
    }
    list.innerHTML = items.map((s, i) => `<div class="selected-item"><span class="selected-num">${String(i + 1).padStart(2, '0')}</span><div class="selected-item-copy"><strong>${esc(s.title)}</strong><small>${esc(cleanText(s.extract || s.snippet, 100))}${(s.extract || s.snippet || '').length > 100 ? '…' : ''}</small></div><button class="selected-remove" type="button" data-deselect-source="${esc(idFor(s))}" aria-label="Remove ${esc(s.title)}">×</button></div>`).join('');
  }
  async function submitSearch(rawQuery, language = prefs.language) {
    const query = cleanText(rawQuery, 300);
    if (!query) { toastMessage('Enter a topic or question to search.'); queryInput.focus(); return; }
    if (pending) requestController?.abort();
    currentQuery = query; currentResults = []; sourceOrder = []; selected.clear(); prefs.language = validLanguage(language) ? language : 'en';
    langControl.value = prefs.language;
    if (mobileLangControl) mobileLangControl.value = prefs.language;
    if (resultsLangControl) resultsLangControl.value = prefs.language;
    persistPrefs(); setView('search');
    welcome.hidden = true; libraryView.hidden = true; historyView.hidden = true; resultsView.hidden = false;
    $('[data-results-heading]').textContent = 'Reading the sources…';
    $('[data-results-subtitle]').textContent = 'Finding the articles that match, then reading the first one.';
    $('[data-current-query]').textContent = query; $('[data-results-count]').textContent = 'Searching…';
    resultsList.innerHTML = `<div class="no-results is-loading"><span class="no-results-icon loading-orb">${icons.search}</span><h3>Searching Wikipedia</h3><p>Reading the article and taking the answer from it.</p><button type="button" data-action="stop-search">Cancel search</button></div>`;
    queryInput.value = query; $('[data-action="clear-query"]').hidden = !query;
    pending = true;
    const controller = new AbortController(); requestController = controller;
    try {
      const data = await searchPublicSources({ query, language: prefs.language, limit: prefs.limit, signal: controller.signal });
      if (controller.signal.aborted) return;
      sourceOrder = [...data.sources];
      currentResults = [...data.sources];
      currentAnswer = null;
      try { currentAnswer = await answerFor(currentResults, query, prefs.language); }
      catch { currentAnswer = null; }
      saveSearch(query, prefs.language, currentResults.length, data.searchedAt);
      view = 'search';
      welcome.hidden = true; resultsView.hidden = false; libraryView.hidden = true; historyView.hidden = true;
      applySort();
      toastMessage(currentResults.length ? `Found ${currentResults.length} source${currentResults.length === 1 ? '' : 's'}.` : 'No matching articles found.');
      const scrollContainer = $('[data-main-scroll]'); scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error?.name === 'AbortError') {
        resultsList.innerHTML = `<div class="no-results"><span class="no-results-icon">${icons.search}</span><h3>Search cancelled</h3><p>Your search was stopped. No answer was generated and no request is still running.</p><button type="button" data-action="retry">Try again ↗</button></div>`;
        $('[data-results-count]').textContent = 'Cancelled';
      } else {
        resultsList.innerHTML = `<div class="no-results"><span class="no-results-icon">!</span><h3>Could not reach Wikipedia</h3><p>${esc(error?.message || 'A network error interrupted this search.')} This browser-only tool needs an internet connection to reach the public source API. No backend or API key is configured.</p><button type="button" data-action="retry">Retry search ↗</button></div>`;
        $('[data-results-count]').textContent = 'Connection error';
      }
    } finally {
      if (requestController === controller) requestController = null;
      pending = false;
      $('[data-results-heading]').textContent = 'Search results';
    }
  }
  function saveSource(source) {
    const key = idFor(source);
    const index = savedSearches.savedSources.findIndex((s) => idFor(s) === key);
    if (index >= 0) { savedSearches.savedSources.splice(index, 1); toastMessage('Removed from your reading list.'); }
    else {
      if (savedSearches.savedSources.length >= MAX_SAVED) savedSearches.savedSources.pop();
      savedSearches.savedSources.unshift({ ...source, savedAt: Date.now() });
      toastMessage('Source saved to your local reading list.');
    }
    persist(); renderLeftList(); renderSelectedPanel();
    if (view === 'search' && currentQuery) renderResults();
    if (view === 'saved') renderLibrary();
  }
  function findSource(key) {
    return currentResults.find((s) => idFor(s) === key) || savedSearches.savedSources.find((s) => idFor(s) === key);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select();
      const ok = document.execCommand('copy'); field.remove(); if (!ok) throw new Error('Copy was blocked by the browser.');
    }
  }
  function downloadFile(name, content, type = 'text/markdown;charset=utf-8') {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function slug(text) { return cleanText(text, 80).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/gi, '-').replace(/^-|-$/g, '') || 'research'; }
  function exportSources(items, title = currentQuery || 'IndusMova sources') {
    if (!items.length) { toastMessage('Select at least one source first.'); return; }
    const content = `# ${title}\n\nExported from IndusMova Research Desk on ${new Date().toLocaleString()}.\n\n> Every line here is a sentence from the article it names. Verify in the original.\n\n${items.map((s) => sourceMarkdown(s)).join('\n---\n\n')}`;
    downloadFile(`indusmova-${slug(title)}.md`, content);
    toastMessage('Sources exported as Markdown.');
  }
  function renderLibrary() {
    const filter = cleanText($('[data-library-filter]').value, 120).toLowerCase();
    const items = savedSearches.savedSources.filter((s) => !filter || `${s.title} ${s.snippet} ${s.extract}`.toLowerCase().includes(filter));
    $('[data-library-list]').innerHTML = items.length ? items.map((s, i) => resultCard(s, i, { saved: true })).join('') : `<div class="library-empty">${icons.bookmark}<h3>${filter ? 'No saved sources match' : 'Your reading list is empty'}</h3><p>${filter ? 'Try another keyword.' : 'Save any search result to keep its title, excerpt and link in this browser. Nothing is synced to a server.'}</p></div>`;
    $('[data-library-heading]').textContent = `Reading list`;
    $('[data-library-description]').textContent = `${savedSearches.savedSources.length} source${savedSearches.savedSources.length === 1 ? '' : 's'} saved locally in this browser.`;
  }
  function renderHistoryPage() {
    const box = $('[data-history-full]');
    box.innerHTML = savedSearches.searches.length ? savedSearches.searches.map((s) => `<article class="history-row"><span class="history-row-icon">${icons.search}</span><div class="history-row-copy"><strong>${esc(s.query)}</strong><small>${esc(langName(s.language))} · ${Number(s.count) || 0} sources · ${esc(relativeDate(s.timestamp))}</small></div><div class="history-row-actions"><button type="button" data-repeat-search="${esc(s.query)}" data-repeat-language="${esc(s.language)}">Search again ↗</button><button type="button" data-delete-history="${esc(s.query)}" data-delete-language="${esc(s.language)}" aria-label="Delete search">×</button></div></article>`).join('') : '<div class="library-empty"><h3>No recent searches</h3><p>Your recent search queries will appear here after you search.</p></div>';
  }
  function showModal(title, kicker, body, footnote = 'Source excerpts are quoted, not synthesized.') {
    lastFocus = document.activeElement;
    $('[data-modal-title]').textContent = title; $('[data-modal-kicker]').textContent = kicker; $('[data-modal-footnote]').textContent = footnote;
    modalBody.innerHTML = body; modalBackdrop.hidden = false;
    $('[data-action="close-modal"]', modalBackdrop).focus();
  }
  function closeModal() { modalBackdrop.hidden = true; if (lastFocus?.focus) lastFocus.focus({ preventScroll: true }); }
  function compareSelected() {
    const items = currentResults.filter((s) => selected.has(idFor(s)));
    if (items.length < 2) { toastMessage('Select at least two sources to compare them.'); return; }
    const body = `<div class="compare-grid">${items.map((s, i) => `<article class="compare-source"><header><span>${String(i + 1).padStart(2, '0')}</span><h3>${esc(s.title)}</h3></header><p>${esc(s.extract || s.snippet || 'No excerpt available.')}</p><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">Open original article ↗</a></article>`).join('')}</div>`;
    showModal('Compare source excerpts', 'SIDE-BY-SIDE READING', body, 'This comparison shows original excerpts side by side. It does not infer which source is correct.');
  }
  function showShortcuts() {
    const rows = [['/', 'Focus search field'], ['⌘ / Ctrl + K', 'Start a new search'], ['Enter', 'Search'], ['Esc', 'Close dialog or mobile navigation'], ['?', 'Show keyboard shortcuts']];
    const body = `<div class="shortcuts-list">${rows.map(([key, action]) => `<div class="shortcut-row"><kbd>${esc(key)}</kbd><span>${esc(action)}</span></div>`).join('')}</div>`;
    showModal('Keyboard shortcuts', 'QUICK REFERENCE', body, 'Shortcuts are disabled while typing in a text field.');
  }
  function openSavedByKey(key) {
    const s = savedSearches.savedSources.find((item) => idFor(item) === key);
    if (s?.url) window.open(s.url, '_blank', 'noopener,noreferrer');
  }
  function clearHistory() {
    if (!savedSearches.searches.length) { toastMessage('Search history is already empty.'); return; }
    if (!window.confirm('Clear all recent searches from this browser? Saved sources will stay in your reading list.')) return;
    savedSearches.searches = []; persist(); renderLeftList(); renderHistoryPage(); toastMessage('Recent search history cleared.');
  }
  function doAction(action, target) {
    switch (action) {
      case 'new-search': showHome(); break;
      case 'theme': saveTheme(prefs.theme === 'dark' ? 'light' : 'dark'); break;
      case 'mobile-menu': workspace.classList.toggle('mobile-nav-open'); scrim.hidden = !workspace.classList.contains('mobile-nav-open'); break;
      case 'mobile-saved': setView('saved'); break;
      case 'clear-query': queryInput.value = ''; $('[data-action="clear-query"]').hidden = true; queryInput.focus(); break;
      case 'retry': submitSearch(currentQuery, prefs.language); break;
      case 'stop-search': requestController?.abort(); break;
      case 'compare': compareSelected(); break;
      case 'clear-selection': selected.clear(); renderResults(); break;
      case 'export-selected': exportSources(currentResults.filter((s) => selected.has(idFor(s)))); break;
      case 'export-library': exportSources(savedSearches.savedSources, 'IndusMova reading list'); break;
      case 'clear-history': clearHistory(); break;
      case 'shortcuts': showShortcuts(); break;
      case 'close-modal': closeModal(); break;
      default: break;
    }
  }

  // Initial settings and saved state.
  saveTheme(prefs.theme);
  langControl.value = prefs.language;
  if (mobileLangControl) mobileLangControl.value = prefs.language;
  if (resultsLangControl) resultsLangControl.value = prefs.language;
  setLimit(prefs.limit); renderLeftList(); renderSelectedPanel();

  searchForm.addEventListener('submit', (event) => { event.preventDefault(); submitSearch(queryInput.value); });
  queryInput.addEventListener('input', () => { $('[data-action="clear-query"]').hidden = !queryInput.value; });
  function changeLanguage(value) { prefs.language = validLanguage(value) ? value : 'en'; langControl.value = prefs.language; if (mobileLangControl) mobileLangControl.value = prefs.language; if (resultsLangControl) resultsLangControl.value = prefs.language; persistPrefs(); if (currentQuery && view === 'search') submitSearch(currentQuery, prefs.language); }
  langControl.addEventListener('change', () => changeLanguage(langControl.value));
  if (mobileLangControl) mobileLangControl.addEventListener('change', () => changeLanguage(mobileLangControl.value));
  if (resultsLangControl) resultsLangControl.addEventListener('change', () => changeLanguage(resultsLangControl.value));
  function changeLimit(value) { setLimit(value); if (currentQuery && view === 'search') submitSearch(currentQuery, prefs.language); }
  limitButtons.forEach((button) => button.addEventListener('click', () => changeLimit(button.dataset.limit)));
  if (mobileLimitControl) mobileLimitControl.addEventListener('change', () => changeLimit(mobileLimitControl.value));
  if (resultsLimitControl) resultsLimitControl.addEventListener('change', () => changeLimit(resultsLimitControl.value));
  sortControl.addEventListener('change', applySort);
  $('[data-library-filter]').addEventListener('input', renderLibrary);

  document.addEventListener('click', async (event) => {
    const actionNode = event.target.closest('[data-action]');
    if (actionNode) { doAction(actionNode.dataset.action, actionNode); return; }
    const suggestion = event.target.closest('[data-query]');
    if (suggestion) { submitSearch(suggestion.dataset.query); return; }
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { setView(viewButton.dataset.view); return; }
    const resultViewButton = event.target.closest('[data-result-view]');
    if (resultViewButton) { resultView = resultViewButton.dataset.resultView; applySort(); return; }
    const repeat = event.target.closest('[data-repeat-search]');
    if (repeat) { submitSearch(repeat.dataset.repeatSearch, repeat.dataset.repeatLanguage || prefs.language); return; }
    const openSaved = event.target.closest('[data-open-saved]');
    if (openSaved) { openSavedByKey(openSaved.dataset.openSaved); return; }
    const deleteHistory = event.target.closest('[data-delete-history]');
    if (deleteHistory) {
      const query = deleteHistory.dataset.deleteHistory; const lang = deleteHistory.dataset.deleteLanguage;
      savedSearches.searches = savedSearches.searches.filter((s) => !(s.query === query && s.language === lang));
      persist(); renderLeftList(); renderHistoryPage(); toastMessage('Search removed from history.'); return;
    }
    const saveButton = event.target.closest('[data-toggle-save]');
    if (saveButton) { const source = findSource(saveButton.dataset.toggleSave); if (source) saveSource(source); return; }
    const copyButton = event.target.closest('[data-copy-source]');
    if (copyButton) {
      const source = findSource(copyButton.dataset.copySource); if (!source) return;
      try { await copyText(`${formatCitation(source)}\n\n${source.extract || source.snippet || ''}`); toastMessage('Citation and source excerpt copied.'); }
      catch { toastMessage('Copy was blocked by this browser.'); }
      return;
    }
    const exportButton = event.target.closest('[data-export-source]');
    if (exportButton) { const source = findSource(exportButton.dataset.exportSource); if (source) exportSources([source], source.title); return; }
    const checkbox = event.target.closest('[data-select-source]');
    if (checkbox) {
      const key = checkbox.dataset.selectSource;
      if (checkbox.checked) selected.add(key); else selected.delete(key);
      renderResults(); return;
    }
    const removeSelected = event.target.closest('[data-deselect-source]');
    if (removeSelected) { selected.delete(removeSelected.dataset.deselectSource); renderResults(); return; }
  });

  scrim.addEventListener('click', () => { workspace.classList.remove('mobile-nav-open'); scrim.hidden = true; });
  modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeModal(); });
  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (event.key === 'Escape') {
      if (!modalBackdrop.hidden) closeModal();
      workspace.classList.remove('mobile-nav-open'); scrim.hidden = true;
    }
    if (!typing && event.key === '/' && modalBackdrop.hidden) { event.preventDefault(); queryInput.focus(); }
    if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); showHome(); }
    if (!typing && event.key === '?' && modalBackdrop.hidden) { event.preventDefault(); showShortcuts(); }
    if (event.key === 'Enter' && event.target.matches('[data-query]')) submitSearch(event.target.dataset.query);
  });
})();
