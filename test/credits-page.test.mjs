import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(ROOT, path), 'utf8');
const [view, css, headers, pkg] = await Promise.all([
  read('assets/js/views/pages.js'),
  read('assets/css/app.css'),
  read('_headers'),
  read('package.json'),
]);

 test('credits page shows Indusmova identity and India-first context without implying government endorsement', () => {
  assert.match(view, /credit-identity/);
  assert.match(view, /assets\/img\/mark\.svg/);
  // The chip names the project's India-first framing in words. It used to carry
  // a flag emoji, which renders as two empty boxes wherever the platform has no
  // emoji font, so the words alone carry the meaning now.
  assert.match(view, /India-first knowledge project/);
  assert.doesNotMatch(view, /\u{1F1EE}\u{1F1F3}/u);
  assert.match(view, /not endorsed by or affiliated with[\s\S]*Government of India/);
});

test('Sarvam AI is credited by name only — no mark is displayed or fetched', () => {
  // Their guidelines limit mark use to Sarvam products and services and to use
  // with permission. This credit is development assistance, so the site must not
  // show, fetch or allow-list their logo at all.
  assert.match(view, /name: 'Sarvam AI'/);
  assert.doesNotMatch(view, /sarvam\.dev/);
  assert.doesNotMatch(view, /logomark-on-(light|dark)/);
  assert.doesNotMatch(view, /wordmark-on-(light|dark)/);
  assert.match(view, /credit-sarvam-fallback/);
  assert.doesNotMatch(headers, /sarvam\.dev/);
});

test('every technology card includes a logo slot, a role, a description, a licence and an external destination', () => {
  assert.match(view, /function creditGroupCard\(item\)/);
  assert.match(view, /creditLogo\(item\)/);
  assert.match(view, /credit-role-chip/);
  assert.match(view, /credit-stack-description/);
  assert.match(view, /credit-stack-licence/);
  assert.match(view, /rel: 'noopener noreferrer'/);
  assert.match(view, /function creditLogo\(item/);
  assert.match(view, /image\.addEventListener\('error'/);
});

test('people and project automation appear as visual cards with an avatar/logo fallback', () => {
  assert.match(view, /credit-people-grid/);
  assert.match(view, /GitHub Actions/);
  assert.match(view, /Dependabot/);
  assert.match(view, /credit-person-avatar-v2/);
  assert.match(view, /credit-person-initials/);
});

test('credits redesign follows global theme tokens and has mobile and reduced-motion rules', () => {
  assert.match(css, /\.credit-stack-card[\s\S]*var\(--surface\)/);
  assert.match(css, /\.credit-sarvam-card/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('release metadata agrees with the stamped build', async () => {
  // A hard-coded version here failed every release instead of catching a real
  // problem. What matters is that package.json and assets/version.json — the
  // file the footer and the cache-bust URLs are stamped from — never disagree.
  const version = JSON.parse(pkg).version;
  const stamped = JSON.parse(await read('assets/version.json')).version;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(stamped, version);
  assert.match(view, /Sarvam AI/);
});
