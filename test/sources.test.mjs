/* Tests for the source registry: the one thing that is ours, not the network's.
 *
 * The audit's sources work left the abort bridge unguarded: getJson forwarded
 * the caller's abort to its own controller and never dropped the listener, so
 * one search added a listener per source to a signal it does not own.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAll } from '../assets/js/sources.js';

/** A stand-in for an AbortSignal that only counts what is attached to it. */
function countingSignal() {
  let added = 0;
  let removed = 0;
  return {
    addEventListener() { added += 1; },
    removeEventListener() { removed += 1; },
    counts() { return { added, removed }; },
  };
}

test('a finished search leaves no abort listeners on the caller signal', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
  try {
    const signal = countingSignal();
    const results = await searchAll('ashoka', { signal, limit: 2 });
    assert.ok(results.length > 0, 'the registry should report every source');
    const { added, removed } = signal.counts();
    assert.ok(added > 0, 'each request should watch the caller signal');
    assert.equal(removed, added, 'every listener must come off when the request ends');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a source that fails does not take the search down', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const results = await searchAll('ashoka', { limit: 2 });
    assert.ok(results.every((r) => r.ok === false), 'every source should be reported as failed');
    assert.ok(results.every((r) => r.items.length === 0));
  } finally {
    globalThis.fetch = realFetch;
  }
});
