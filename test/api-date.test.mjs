import test from 'node:test';
import assert from 'node:assert/strict';
import { featuredDatePath } from '../assets/js/api.js';

test('featured feed date follows the reader local day rather than UTC', () => {
  const original = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
  try {
    // 19:00 UTC on 6 Nov is 00:30 on 7 Nov in India.
    assert.equal(featuredDatePath(new Date('2026-11-06T19:00:00.000Z')), '2026/11/07');
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
