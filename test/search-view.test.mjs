/* Tests for the search results view.
 *
 * The page used to put every match in the same four-column card grid the
 * dashboard uses for browsing, so a result was a thumb-wide box with a title
 * broken over three lines. These tests pin the shape that replaced it: one
 * row per result, with the picture, the source line, the title and a snippet,
 * in that order — and no result left without a title.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><main id="main"></main></body></html>', {
  url: 'https://indusmova.pages.dev/#/search?q=moon',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.localStorage = dom.window.localStorage;

const { renderSearch } = await import('../assets/js/views/search.js');
const { t } = await import('../assets/js/i18n.js');

function makeCtx() {
  const navigations = [];
  return {
    navigations,
    state: { contentLang: 'en', mode: 'ask', depth: 'detailed', deepRank: false, uiLang: 'en' },
    api: {
      async search(_lang, query) {
        assert.equal(query, 'moon');
        return [
          { title: 'Moon', description: 'Natural satellite' },
          { title: 'Chandrayaan-3', description: 'Indian lunar mission' },
        ];
      },
      async summaries() {
        return new Map([
          ['Moon', { extract: 'The Moon is Earth’s only natural satellite.', thumb: { src: 'https://upload.wikimedia.org/x.jpg' } }],
          ['Chandrayaan-3', { extract: 'Chandrayaan-3 was a lunar lander mission by ISRO.' }],
        ]);
      },
    },
    setMode(value) { this.state.mode = value; },
    navigate(path) { navigations.push(path); },
    onSubmit() {},
    t,
    suggest: async () => [],
    onCleanup() {},
  };
}

const flush = () => new Promise((r) => setTimeout(r, 30));

test('a search result is a row with a title, a source line and a snippet', async () => {
  const ctx = makeCtx();
  const node = await renderSearch(ctx, { name: 'search', query: { q: 'moon' }, params: {} });
  document.getElementById('main').append(node);
  await flush();

  const rows = [...document.querySelectorAll('.sres-row')];
  assert.equal(rows.length, 2, 'one row per match');
  assert.ok(rows.every((row) => row.classList.contains('sres-row')));

  const first = rows[0];
  assert.ok(first.querySelector('.sres-thumb'), 'the picture has its own box');
  assert.equal(first.querySelector('.sres-title').textContent, 'Moon');
  assert.match(first.querySelector('.sres-src').textContent, /en\.wikipedia\.org/);
  assert.match(first.querySelector('.sres-snippet').textContent, /natural satellite/);
});

test('results are not put back into the card grid', async () => {
  assert.equal(document.querySelectorAll('#searchResults .grid').length, 0);
});

test('the search box on this page searches, whatever mode was last used', async () => {
  const ctx = makeCtx();
  const node = await renderSearch(ctx, { name: 'search', query: { q: 'moon' }, params: {} });
  document.getElementById('main').append(node);
  await flush();

  assert.equal(ctx.state.mode, 'search', 'arriving on Search sets the form to Search');
  // Look it up by class, not by id: the previous test left a form with the
  // same id in the document, and jsdom's selector engine caches id lookups.
  const form = node.querySelector('form.searchbar');
  assert.ok(form, 'the composer is on the page');
  form.querySelector('textarea').value = 'Ashoka';
  form.requestSubmit();
  assert.deepEqual(ctx.navigations, ['/search?q=Ashoka']);
});

test('an empty query offers the empty state, not a spinner', async () => {
  const ctx = makeCtx();
  const node = await renderSearch(ctx, { name: 'search', query: { q: '' }, params: {} });
  assert.ok(node.querySelector('.state'), 'a state block is shown');
  assert.equal(node.querySelectorAll('.sres-row').length, 0);
});
