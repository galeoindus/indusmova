/* Tests for the parser's pure parts: sentence splitting, the slug helpers and
 * the canonical rules. These cover the audit's F-10 (a section fragment must
 * not become part of an article title). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { sentences, MIN_SENTENCE, routeHref } from '../assets/js/parse.js';
import { slugify, unslug, pathFor, isRtl } from '../assets/js/meta.js';

test('sentences splits on a full stop', () => {
  const out = sentences('The mission launched in July 2023. It landed near the lunar south pole.');
  assert.equal(out.length, 2);
});

test('sentences does not split at an abbreviation (c. 268 BCE)', () => {
  const out = sentences('Ashoka ruled from c. 268 BCE until his death in 232 BCE.');
  assert.equal(out.length, 1);
});

test('sentences drops a pronunciation aside', () => {
  const out = sentences('Ashoka (ə-SHOH-kə; Sanskrit: [ɐˈɕoːkɐ]) was the third ruler of the Maurya Empire.');
  assert.equal(out.length, 1);
  assert.ok(!out[0].includes('ɐ'), 'IPA should not survive into the text');
});

test('a fragment shorter than the threshold is not a sentence', () => {
  assert.ok(sentences('Too short.').length === 0);
  assert.ok('A short factual sentence, but long enough.'.length >= MIN_SENTENCE);
  assert.equal(sentences('A short factual sentence, but long enough.').length, 1);
});

test('sentences never returns empty strings', () => {
  const out = sentences('One thing happened here today. Another thing happened there yesterday.');
  for (const s of out) assert.ok(s.trim().length > 0);
});

test('slugs round-trip without losing the title', () => {
  for (const title of ['Chandrayaan-3', 'Indian independence movement', 'Unified Payments Interface']) {
    assert.equal(unslug(slugify(title)), title);
  }
});

test('only articles get a clean path, app state does not', () => {
  assert.equal(pathFor({ name: 'article', params: { title: 'Chandrayaan-3' } }),
    'https://indusmova.pages.dev/articles/Chandrayaan-3/');
  assert.equal(pathFor({ name: 'home' }), 'https://indusmova.pages.dev/');
  assert.equal(pathFor({ name: 'search', path: '/search', query: { q: 'x' } }), null,
    'a query-driven view has no canonical path of its own');
});

test('right-to-left editions are recognised', () => {
  assert.equal(isRtl('ur'), true);
  assert.equal(isRtl('en'), false);
});

test('a cross-reference with a section keeps the title clean (F-10)', () => {
  const out = routeHref('/wiki/Chandrayaan-3#Design');
  assert.equal(out.internal, true);
  assert.ok(out.href.includes('Chandrayaan-3'), 'the title must survive');
  assert.ok(!out.href.includes('Design%23'), 'the fragment must not be inside the title');
  assert.ok(out.href.includes('s=Design'), 'the section is carried as its own parameter');
});

test('a plain cross-reference still works', () => {
  const out = routeHref('/wiki/Black_hole');
  assert.equal(out.internal, true);
  assert.ok(out.href.startsWith('#/article/'));
  assert.ok(!out.href.includes('?'));
});

test('file and special pages are not turned into articles', () => {
  assert.equal(routeHref('/wiki/File:Example.jpg'), null);
  assert.equal(routeHref('/wiki/Category:Space'), null);
  assert.equal(routeHref('/wiki/Special:Random'), null);
});

test('an external link stays external', () => {
  const out = routeHref('https://www.isro.gov.in/');
  assert.equal(out.internal, false);
  assert.match(out.href, /^https:/);
});
