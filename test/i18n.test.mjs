/* The interface dictionary, checked rather than trusted.
 *
 * Twice now a string has been added to the wrong block, or added twice, and
 * JavaScript silently keeps the last one — so the English interface showed
 * Hindi, and an old sentence kept winning over a new one. These tests make
 * that class of mistake fail loudly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'assets', 'js', 'i18n.js'), 'utf8');

function block(name) {
  const start = source.indexOf(`  ${name}: {`);
  const end = source.indexOf('\n  },\n', start);
  return source.slice(start, end);
}

function keysOf(text) {
  return [...text.matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);
}

test('no key is defined twice in the English block', () => {
  const keys = keysOf(block('en'));
  const seen = new Set(); const dupes = [];
  for (const k of keys) { if (seen.has(k)) dupes.push(k); seen.add(k); }
  assert.deepEqual(dupes, [], `duplicate keys keep only the last value: ${dupes.join(', ')}`);
});

test('no key is defined twice in the Hindi block', () => {
  const keys = keysOf(block('hi'));
  const seen = new Set(); const dupes = [];
  for (const k of keys) { if (seen.has(k)) dupes.push(k); seen.add(k); }
  assert.deepEqual(dupes, [], `duplicate keys keep only the last value: ${dupes.join(', ')}`);
});

test('both languages define the same keys', () => {
  const en = new Set(keysOf(block('en')));
  const hi = new Set(keysOf(block('hi')));
  const missing = [...en].filter((k) => !hi.has(k));
  const extra = [...hi].filter((k) => !en.has(k));
  assert.deepEqual(missing, [], `Hindi is missing: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `Hindi has keys English does not: ${extra.join(', ')}`);
});

test('the Hindi block contains no Latin-script placeholder copy', () => {
  // A stray English sentence in the Hindi block means a string was added to
  // the wrong place.
  const hi = block('hi');
  const suspects = [...hi.matchAll(/:\s*'([^']{25,})'/g)]
    .map((m) => m[1])
    .filter((v) => !/[\u0900-\u097F]/.test(v) && /^[A-Z][a-z]+ [a-z]/.test(v));
  assert.deepEqual(suspects, [], `English-looking copy in the Hindi block: ${suspects.slice(0, 3).join(' | ')}`);
});

test('the retired language claim is gone', () => {
  assert.ok(!/280\+/.test(source), 'the "280+ languages" claim should not appear anywhere');
});
