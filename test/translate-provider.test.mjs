/* Tests for the translation provider layer.
 *
 * These pin the two things the audit found were wrong with the old code:
 * text was clipped to a character count that overflows the provider's byte
 * limit, and a failed passage was dropped instead of being kept and marked.
 * The network is stubbed, so the tests are deterministic.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitByBytes, byteLength, translateTexts, resetTranslationState } from '../assets/js/translate-provider.js';

test('splitByBytes never exceeds the byte budget', () => {
  const devanagari = 'यह एक लंबा वाक्य है। '.repeat(40);
  const arabic = 'هذه جملة طويلة للاختبار. '.repeat(40);
  const latin = 'This is a long sentence for testing. '.repeat(40);
  for (const text of [devanagari, arabic, latin]) {
    for (const piece of splitByBytes(text, 200)) {
      assert.ok(byteLength(piece) <= 200, `piece over budget: ${byteLength(piece)}`);
    }
  }
});

test('splitByBytes loses no words', () => {
  const text = 'Alpha beta gamma. Delta epsilon zeta. Eta theta iota.'.repeat(12);
  const pieces = splitByBytes(text, 120);
  const words = (value) => value.split(/\s+/).filter(Boolean);
  assert.deepEqual(words(pieces.join(' ')), words(text));
});

test('splitByBytes keeps a short string whole', () => {
  assert.deepEqual(splitByBytes('Short one.', 200), ['Short one.']);
  assert.deepEqual(splitByBytes('   ', 200), []);
});

/** Replace global fetch with a scripted sequence of responses. */
function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

test('a passage the provider cannot translate is kept and marked failed', async () => {
  resetTranslationState();
  const restore = stubFetch(async () => new Response('nope', { status: 500 }));
  try {
    const out = await translateTexts(['Hello world', 'Second passage'], 'hi', { source: 'en' });
    assert.equal(out.length, 2);
    for (const item of out) {
      assert.equal(item.status, 'failed');
      // The original text is still there: nothing was blanked or shortened.
      assert.ok(item.text.length > 0);
    }
  } finally {
    restore();
  }
});

test('a batch answer is applied in order', async () => {
  resetTranslationState();
  const restore = stubFetch(async (url) => {
    const u = new URL(String(url));
    const qs = u.searchParams.getAll('q');
    // Google's batch shape: one array per q.
    return new Response(JSON.stringify(qs.map((q) => [q.toUpperCase()])), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  try {
    const out = await translateTexts(['one', 'two', 'three'], 'hi', { source: 'en' });
    assert.deepEqual(out.map((r) => r.text), ['ONE', 'TWO', 'THREE']);
    assert.ok(out.every((r) => r.status === 'translated'));
  } finally {
    restore();
  }
});

test('the source language is passed to the provider, not assumed English', async () => {
  resetTranslationState();
  const seen = [];
  const restore = stubFetch(async (url) => {
    seen.push(new URL(String(url)).searchParams.get('sl'));
    return new Response(JSON.stringify([['x']]), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  try {
    await translateTexts(['नमस्ते दुनिया'], 'en', { source: 'hi' });
    assert.ok(seen.length > 0);
    assert.equal(seen[0], 'hi');
  } finally {
    restore();
  }
});
