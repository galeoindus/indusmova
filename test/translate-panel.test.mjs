/* Tests for the Translate tab's one-step behaviour.
 *
 * The panel used to open on a dropdown and a "Translate the whole article"
 * button: choose a language, then press again. The tab now opens on the
 * languages themselves, and one press on a language is the whole request.
 * These tests fail if the second step comes back.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://indusmova.pages.dev/#/article/ISRO',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);

const { translatePanel } = await import('../assets/js/article-translate.js');
const { t } = await import('../assets/js/i18n.js');

function makeState() {
  const fullMount = document.createElement('div');
  const panel = document.createElement('div');
  panel.className = 'panel-wide';
  panel.innerHTML = '<h2>History</h2><p>The organisation was founded in 1969 and renamed later that decade.</p>';
  fullMount.append(panel);
  return {
    lang: 'en',
    data: { title: 'ISRO', revid: 1, langlinks: [] },
    fullMount,
  };
}

const ctx = {
  t,
  api: {
    async article() {
      throw new Error('offline in this test');
    },
  },
};

test('the panel opens on the languages, not on a dropdown', () => {
  const panel = translatePanel(makeState(), ctx);
  assert.equal(panel.dataset.state, 'choosing');
  assert.ok(panel.querySelector('.tr-langs'), 'a language list is on the panel');
  assert.ok(panel.querySelectorAll('.tr-lang').length > 20, 'the whole world is offered');
  assert.equal(panel.querySelector('select#trLang'), null, 'no dropdown to open first');
});

test('one press on a language is the whole request', async () => {
  const panel = translatePanel(makeState(), ctx);
  const button = [...panel.querySelectorAll('.tr-lang')].find((b) => b.dataset.code === 'hi');
  assert.ok(button, 'Hindi is offered');

  button.click();
  assert.equal(panel.dataset.state, 'reading', 'the panel switches to reading at once');
  assert.equal(panel.querySelector('.tr-choose').hidden, true, 'the list steps aside');
  assert.equal(panel.querySelector('.tr-read').hidden, false, 'the reading pane appears');

  // No second "Translate" press exists anywhere on the panel.
  const labels = [...panel.querySelectorAll('.tr-read button')].map((b) => b.textContent.trim());
  assert.ok(!labels.includes(t('translateStart')), 'there is no translate button left to press');

  // Let the (offline) attempt settle so nothing is left running.
  await new Promise((r) => setTimeout(r, 30));
  panel.abortTranslation?.();
});

test('"Change language" brings the list back', () => {
  const panel = translatePanel(makeState(), ctx);
  panel.querySelector('.tr-lang[data-code="ta"]').click();
  panel.querySelector('.tr-readbar .btn:last-child').click();
  assert.equal(panel.dataset.state, 'choosing');
  assert.equal(panel.querySelector('.tr-choose').hidden, false);
  assert.equal(panel.querySelector('.tr-read').hidden, true);
  panel.abortTranslation?.();
});

test('the filter hides the languages that do not match', () => {
  const panel = translatePanel(makeState(), ctx);
  const filter = panel.querySelector('.tr-filter');
  filter.value = 'tamil';
  filter.dispatchEvent(new dom.window.Event('input'));
  const shown = [...panel.querySelectorAll('.tr-lang')].filter((b) => !b.hidden);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].dataset.code, 'ta');
  assert.equal(panel.querySelector('.tr-empty').hidden, true);
});
