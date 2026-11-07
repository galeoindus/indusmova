/* The chat shell: one scrolling column, one fixed composer, one design layer. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../chat/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/css/squircle.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../assets/js/chat-page.js', import.meta.url), 'utf8');
const dom = new JSDOM(html);
const doc = dom.window.document;

test('the composer is a row of the column, not a sticky element in the scroller', () => {
  const dock = doc.querySelector('#dock');
  const scroll = doc.querySelector('#main');
  assert.ok(dock && scroll);
  assert.equal(dock.parentElement.className, 'main');
  assert.equal(scroll.parentElement.className, 'main');
  assert.equal(dock.parentElement, scroll.parentElement);
  // header, scroller, composer — in that order, so the composer is always last.
  assert.deepEqual([...dock.parentElement.children].map((n) => n.className), ['top', 'scroll', 'dock']);
  assert.equal(scroll.contains(dock), false);
});

test('the squircle layer is the last stylesheet, so it wins', () => {
  const sheets = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href').split('?')[0]);
  assert.equal(sheets.at(-1), '/assets/css/squircle.css');
  assert.match(css, /corner-shape: squircle/);
  assert.match(css, /@supports \(corner-shape: squircle\)/);
});

test('every icon in the header is drawn in the same box', () => {
  const buttons = [...doc.querySelectorAll('.top .ico, .top .rail-toggle')];
  assert.ok(buttons.length >= 3);
  for (const button of buttons) {
    const svg = button.querySelector('svg');
    assert.ok(svg, 'each icon button has an svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
  }
  // The layer pins one size per role instead of inheriting whatever the
  // previous stylesheet left behind.
  assert.match(css, /--ico-md: 19px/);
  assert.match(css, /body\.amigo-chat \.ico svg[\s\S]*?width: var\(--ico-md\)/);
  assert.match(css, /stroke-linecap: round/);
});

test('the composer controls are one size and centred', () => {
  assert.match(css, /\.composer \.plus,[\s\S]*?\.composer \.mic,[\s\S]*?\.composer \.send \{[\s\S]*?width: 40px;[\s\S]*?height: 40px;/);
  assert.match(css, /display: inline-flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/);
});

test('the model menu exists, defaults to Auto and is sent with the question', () => {
  const select = doc.querySelector('#modelChoice');
  assert.ok(select, 'the model selector is in the answer options');
  assert.equal(select.value, 'auto');
  assert.equal(select.options[0].value, 'auto');
  assert.ok(doc.querySelector('#modelNote'));
  assert.match(js, /fetch\('\/api\/models'/);
  assert.match(js, /model: chosenModel\(\)/);
  assert.match(js, /indusmova:chat:model/);
});

test('the rail says which model will answer', () => {
  const foot = doc.querySelector('.rail-foot');
  assert.ok(foot);
  assert.ok(doc.querySelector('#railModel'));
  assert.match(js, /function paintRailModel/);
});

test('nothing on the chat page can scroll sideways', () => {
  assert.match(css, /body\.amigo-chat \.main \{[\s\S]*?overflow: hidden;/);
  assert.match(css, /max-width: 100%;\n  min-width: 0;/);
});

test('reduced motion is honoured', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
