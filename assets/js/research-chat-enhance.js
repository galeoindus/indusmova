/* Progressive enhancement for the existing Research Desk.
 * Keeps the original search core, saved sources, comparison, language, history,
 * sorting and keyboard actions. This adds a conversational presentation only;
 * it never invents/synthesizes an answer or claims that a model was used.
 */
(() => {
  'use strict';
  const app = document.getElementById('research-app');
  if (!app || app.dataset.rcEnhanced === 'true') return;
  app.dataset.rcEnhanced = 'true';

  const $ = (selector, root = document) => root.querySelector(selector);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const main = $('.main-column');
  const scroll = $('.main-scroll');
  const form = $('[data-search-form]');
  const welcome = $('[data-welcome]');
  const results = $('[data-results-view]');
  const resultsTitle = $('[data-results-heading]');
  const resultsSubtitle = $('[data-results-subtitle]');
  const resultList = $('[data-results-list]');
  const queryInput = $('[data-query-input]');
  if (!main || !scroll || !form || !welcome || !results || !resultList || !queryInput) return;

  // Keep the original search form and all its data attributes; change its place,
  // not its implementation. This leaves a composer available during a session.
  const dock = make('div', 'rc-composer-dock');
  dock.setAttribute('role', 'region');
  dock.setAttribute('aria-label', 'Research message composer');
  dock.append(make('div', 'rc-composer-label', 'Ask a question or explore a topic'));
  dock.append(form);
  dock.append(make('div', 'rc-composer-hint', 'Press Enter to search · Ctrl/⌘ + K for a new search'));
  main.insertBefore(dock, $('.main-footer', main));
  const submitButton = $('.search-submit span:first-child', form);
  if (submitButton) submitButton.textContent = 'Send';
  queryInput.placeholder = 'Ask a question to explore the evidence…';
  queryInput.setAttribute('aria-label', 'Ask a question to explore references');

  // Rewrite user-facing help copy—not implementation or source data.
  const brandSub = $('.brand-copy small');
  if (brandSub) brandSub.textContent = 'RESEARCH CONVERSATION';
  const topbarText = $('.topbar-center');
  if (topbarText) {
    const dot = $('.status-dot', topbarText);
    topbarText.replaceChildren();
    if (dot) topbarText.append(dot);
    topbarText.append(document.createTextNode(' Your question · Original evidence'));
  }
  const mobileHeading = $('.mobile-heading > span');
  if (mobileHeading) mobileHeading.textContent = 'Research conversation';
  const welcomeTitle = $('h1', welcome);
  if (welcomeTitle) welcomeTitle.innerHTML = 'Ask with curiosity.<br><span>Explore the evidence.</span>';
  const subtitle = $('.welcome-subtitle', welcome);
  if (subtitle) subtitle.textContent = 'Search a topic, inspect original excerpts, compare references, and save the sources worth returning to.';
  const footnote = $('.search-footnote', welcome);
  if (footnote) footnote.textContent = 'Original references · Clear provenance · Reading history stays on this device';
  const note = $('.honesty-note p', welcome);
  if (note) {
    note.replaceChildren();
    const strong = make('strong', '', 'Evidence first. ');
    note.append(strong, document.createTextNode('Open an original page to verify its context before relying on a claim.'));
  }
  const infoTitle = $('.right-info-card strong');
  const infoText = $('.right-info-card p');
  if (infoTitle) infoTitle.textContent = 'Research, with receipts';
  if (infoText) infoText.textContent = 'Open any reference to review its original page. Compare excerpts side by side before drawing conclusions.';
  const languageHelp = $('.right-rail .control-section .control-help');
  if (languageHelp) languageHelp.textContent = 'Choose the language edition most useful for your question.';
  const contentOptionHelp = [...app.querySelectorAll('.control-help')].find((n) => /rewritten by AI|source/i.test(n.textContent));
  if (contentOptionHelp) contentOptionHelp.textContent = 'Open a reference to see the full original context.';
  const sourceFoot = $('.results-bottom-note');
  if (sourceFoot) sourceFoot.hidden = true;
  const rightRail = $('.right-rail');
  if (rightRail) {
    const labels = rightRail.querySelectorAll('.eyebrow');
    labels.forEach((n) => {
      if (n.textContent.trim() === 'SEARCH SETTINGS') n.textContent = 'PREFERENCES';
      if (n.textContent.trim() === 'WORKSPACE') n.textContent = 'EVIDENCE TRAY';
    });
  }

  // A transcript lives inside the existing results view; result/source DOM stays
  // owned by the original module so sort/compare/save/export keep working.
  const titleRow = $('.results-title-row', results);
  const thread = make('section', 'rc-chat-thread');
  thread.setAttribute('aria-label', 'Research conversation');
  thread.setAttribute('aria-live', 'polite');
  const userTurn = make('div', 'rc-user-turn');
  const userBubble = make('div', 'rc-user-bubble');
  userBubble.setAttribute('dir', 'auto');
  userTurn.append(userBubble);
  const assistantTurn = make('div', 'rc-assistant-turn');
  const assistantMark = make('span', 'rc-assistant-mark');
  assistantMark.setAttribute('aria-hidden', 'true');
  assistantMark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="m19 16 .7 2.1L22 19l-2.3.8L19 22l-.8-2.2L16 19l2.1-.8Z"/></svg>';
  const assistantCopy = make('div', 'rc-assistant-copy');
  assistantCopy.append(make('div', 'rc-assistant-label', 'Evidence trail'));
  const status = make('p', 'rc-assistant-status', 'Finding relevant references and original excerpts…');
  assistantCopy.append(status);
  assistantTurn.append(assistantMark, assistantCopy);
  thread.append(userTurn, assistantTurn);
  if (titleRow) titleRow.after(thread);
  else results.prepend(thread);

  function addTurn(raw) {
    const query = String(raw ?? '').trim().slice(0, 300);
    if (!query) return;
    userBubble.textContent = query;
    status.textContent = 'Finding relevant reference entries and original excerpts…';
    status.classList.add('is-pending');
    thread.hidden = false;
    if (resultsTitle) resultsTitle.textContent = 'Research conversation';
    if (resultsSubtitle) resultsSubtitle.textContent = 'Your question, followed by the original references that may help answer it.';
  }

  form.addEventListener('submit', () => addTurn(queryInput.value), true);
  document.addEventListener('click', (event) => {
    const queryButton = event.target.closest('[data-query]');
    if (queryButton && queryButton.dataset.query) addTurn(queryButton.dataset.query);
    const repeat = event.target.closest('[data-repeat-search]');
    if (repeat && repeat.dataset.repeatSearch) addTurn(repeat.dataset.repeatSearch);
    const newSearch = event.target.closest('[data-action="new-search"]');
    if (newSearch) {
      thread.hidden = true;
      status.classList.remove('is-pending');
    }
  }, true);

  function updateStatus() {
    if (!results || results.hidden || thread.hidden) return;
    if (resultsTitle && resultsTitle.textContent !== 'Research conversation') resultsTitle.textContent = 'Research conversation';
    if (resultsSubtitle && resultsSubtitle.textContent !== 'Your question, followed by the original references that may help answer it.') {
      resultsSubtitle.textContent = 'Your question, followed by the original references that may help answer it.';
    }
    const loading = $('.no-results.is-loading', resultList);
    if (loading) {
      const heading = $('h3', loading);
      const paragraph = $('p', loading);
      if (heading) heading.textContent = 'Finding relevant references';
      if (paragraph) paragraph.textContent = 'Collecting source titles, original excerpts, and article context.';
      status.textContent = 'Searching for matching reference entries…';
      status.classList.add('is-pending');
      return;
    }
    const empty = $('.no-results', resultList);
    if (empty) {
      const heading = $('h3', empty);
      const paragraph = $('p', empty);
      if (heading) heading.textContent = 'No matching references yet';
      if (paragraph) paragraph.textContent = 'Try a broader phrase, another spelling, or a different language.';
      status.textContent = 'No matching references were found. You can refine the question and try again.';
      status.classList.remove('is-pending');
      return;
    }
    const cards = resultList.querySelectorAll('.source-card').length;
    if (cards) {
      status.textContent = `Found ${cards} relevant reference${cards === 1 ? '' : 's'}. Open a source for its original context, or save and compare excerpts below.`;
      status.classList.remove('is-pending');
    }
  }
  const observer = new MutationObserver(updateStatus);
  observer.observe(resultList, { subtree: true, childList: true, characterData: true });
  observer.observe(results, { attributes: true, attributeFilter: ['hidden'] });

  // The source tray and existing controls remain available; announce the new
  // session view without changing the existing source-search behaviour.
  const titleObserver = new MutationObserver(() => {
    if (!results.hidden && thread.hidden === false) updateStatus();
  });
  if (resultsTitle) titleObserver.observe(resultsTitle, { childList: true, characterData: true, subtree: true });
})();
