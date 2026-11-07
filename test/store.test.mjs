/* Tests for the local store: the lists a reader sees must be the lists that
 * were actually saved. toggleBookmark and pushHistory both capped what they
 * wrote and then announced the uncapped array, so a view could render an entry
 * that was never stored.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'https://indusmova.pages.dev/' });
globalThis.localStorage = dom.window.localStorage;

const { on, pushHistory, getHistory, toggleBookmark, getBookmarks, clearHistory, clearBookmarks } =
  await import('../assets/js/store.js');

test('the history event never carries more than the 200 that were saved', () => {
  clearHistory();
  let seen = null;
  const off = on('history', (list) => { seen = list; });
  for (let i = 0; i < 205; i += 1) pushHistory({ id: `h${i}`, title: `Entry ${i}` });
  off();
  assert.equal(getHistory().length, 200);
  assert.ok(seen, 'the store should announce the save');
  assert.equal(seen.length, getHistory().length, 'the event and the storage must agree');
  assert.equal(seen[0].id, 'h204', 'the newest entry comes first');
});

test('the bookmark event never carries more than the 500 that were saved', () => {
  clearBookmarks();
  let seen = null;
  const off = on('bookmarks', (list) => { seen = list; });
  for (let i = 0; i < 505; i += 1) toggleBookmark({ id: `b${i}`, title: `Bookmark ${i}` });
  off();
  assert.equal(getBookmarks().length, 500);
  assert.equal(seen.length, getBookmarks().length, 'the event and the storage must agree');
  assert.equal(seen[0].id, 'b504');
});

test('a bookmark toggles off again', () => {
  clearBookmarks();
  assert.equal(toggleBookmark({ id: 'x', title: 'X' }), true);
  assert.equal(getBookmarks().length, 1);
  assert.equal(toggleBookmark({ id: 'x', title: 'X' }), false);
  assert.equal(getBookmarks().length, 0);
});
