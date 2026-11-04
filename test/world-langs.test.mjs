/* Tests for the language list behind the Translate control.
 *
 * The list is what a reader scrolls to find their own language, so a duplicate
 * code would silently make one entry unreachable, and a missing `rtl` flag
 * would render Urdu or Arabic as a left-aligned block. These pin both down.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_LANGS, langRecord, isRtlLang } from '../assets/js/world-langs.js';

test('every language has a code, an English name and a native name', () => {
  for (const lang of WORLD_LANGS) {
    // ISO 639-1 is two letters, 639-2/3 is three (mai, kok, mni, brx, doi,
    // sat, ceb, haw, hmn), and Chinese carries a region suffix.
    assert.match(lang.code, /^[a-z]{2,3}(-[A-Z]{2})?$/, `bad code: ${lang.code}`);
    assert.ok(lang.name && lang.name.length > 1, `missing English name for ${lang.code}`);
    assert.ok(lang.native && lang.native.length > 0, `missing native name for ${lang.code}`);
  }
});

test('no language code appears twice', () => {
  const seen = new Set();
  for (const lang of WORLD_LANGS) {
    assert.ok(!seen.has(lang.code), `duplicate code: ${lang.code}`);
    seen.add(lang.code);
  }
});

test('the Indian languages this site is built for are all present', () => {
  const codes = new Set(WORLD_LANGS.map((l) => l.code));
  for (const code of ['hi', 'bn', 'mr', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or', 'as', 'sa']) {
    assert.ok(codes.has(code), `missing ${code}`);
  }
});

test('the world is covered beyond India', () => {
  const codes = new Set(WORLD_LANGS.map((l) => l.code));
  for (const code of ['ar', 'zh-CN', 'ja', 'ru', 'fr', 'de', 'es', 'pt', 'sw', 'id']) {
    assert.ok(codes.has(code), `missing ${code}`);
  }
  assert.ok(WORLD_LANGS.length >= 90, 'the list should be the world, not a dozen languages');
});

test('right-to-left scripts are marked', () => {
  for (const code of ['ur', 'ar', 'fa', 'he', 'sd', 'ks', 'dv']) {
    assert.equal(isRtlLang(code), true, `${code} should be RTL`);
  }
  assert.equal(isRtlLang('hi'), false);
  assert.equal(isRtlLang('en'), false);
});

test('an unknown code still yields a usable label', () => {
  const record = langRecord('xx');
  assert.equal(record.code, 'xx');
  assert.equal(record.native, 'XX');
  // A regional variant falls back to its base language.
  assert.equal(langRecord('pt-BR').code, 'pt');
});
