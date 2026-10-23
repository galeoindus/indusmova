/* Tests for the router, written to pin down the audit's F-01.
 *
 * The bug was that a change of query only — a second search, the next date in
 * On this day, a different Library source — looked like the same route and
 * nothing re-rendered. These tests fail if the query drops out of the key
 * again.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, routeKey, articleHref, workHref } from '../assets/js/router.js';

test('parse splits a path and its query', () => {
  const route = parse('#/search?q=Ashoka&m=ask');
  assert.equal(route.name, 'search');
  assert.equal(route.query.q, 'Ashoka');
  assert.equal(route.query.m, 'ask');
});

test('parse decodes an article title', () => {
  const route = parse('#/article/Chandrayaan-3');
  assert.equal(route.name, 'article');
  assert.equal(route.params.title, 'Chandrayaan-3');
});

test('the route key changes when only the query changes (F-01)', () => {
  const a = parse('#/search?q=Ashoka');
  const b = parse('#/search?q=photosynthesis');
  assert.notEqual(routeKey(a), routeKey(b), 'a second search must not look like the same route');
});

test('the route key is stable for the same query in a different order', () => {
  const a = parse('#/search?q=x&m=ask');
  const b = parse('#/search?m=ask&q=x');
  assert.equal(routeKey(a), routeKey(b));
});

test('the route key differs across dates on On this day', () => {
  assert.notEqual(routeKey(parse('#/today?m=10&d=20')), routeKey(parse('#/today?m=10&d=19')));
});

test('the route key differs across Library sources', () => {
  assert.notEqual(routeKey(parse('#/library?q=x&src=books')), routeKey(parse('#/library?q=x&src=research')));
});

test('article links are real anchors, never an empty href', () => {
  const href = articleHref('Chandrayaan-3', 'en');
  assert.match(href, /^#\/article\//);
  assert.ok(href.length > 3);
});

test('a work link carries both source and id', () => {
  const href = workHref('gutenberg', '1342');
  assert.match(href, /src=gutenberg/);
  assert.match(href, /id=1342/);
});
