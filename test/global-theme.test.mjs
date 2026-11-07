import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/global-theme.js', import.meta.url), 'utf8');

function createThemeSandbox({ stored = null, systemDark = false } = {}) {
  const values = new Map(stored == null ? [] : [['indusmova:theme', stored]]);
  const documentHandlers = new Map();
  const windowHandlers = new Map();
  const mediaHandlers = new Map();
  const root = { dataset: {}, style: {}, setAttribute(key, value) { this.dataset[key.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value; } };
  const research = { dataset: {} };
  const meta = { content: '', setAttribute(key, value) { this[key] = value; } };
  const svg = { innerHTML: '', setAttribute() {} };
  const attrs = {};
  const button = {
    dataset: {}, title: '', innerHTML: '',
    matches(selector) { return selector === '#themeBtn'; },
    querySelector() { return svg; },
    setAttribute(key, value) { attrs[key] = value; },
  };
  const document = {
    documentElement: root,
    querySelectorAll(selector) {
      if (selector.startsWith('meta[')) return [meta];
      if (selector.includes('#themeBtn')) return [button];
      return [];
    },
    getElementById(id) { return id === 'research-app' ? research : null; },
    addEventListener(name, fn) { documentHandlers.set(name, fn); },
  };
  const media = {
    matches: systemDark,
    addEventListener(name, fn) { mediaHandlers.set(name, fn); },
    addListener(fn) { mediaHandlers.set('change', fn); },
  };
  const window = {
    matchMedia() { return media; },
    addEventListener(name, fn) { windowHandlers.set(name, fn); },
    dispatchEvent(event) { this.lastEvent = event; },
  };
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
  vm.runInNewContext(source, { document, window, localStorage, CustomEvent, console });
  return { window, document, root, research, meta, button, svg, attrs, values, documentHandlers, windowHandlers, mediaHandlers, media };
}

test('shared theme resolves system preference and cycles auto → light → dark', () => {
  const env = createThemeSandbox({ systemDark: true });
  assert.equal(env.root.dataset.theme, 'dark');
  assert.equal(env.root.dataset.themeMode, 'auto');
  assert.equal(env.research.dataset.theme, 'dark');
  assert.equal(env.meta.content, '#0b1110');

  let prevented = false;
  env.documentHandlers.get('click')({
    target: { closest: () => env.button },
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(env.root.dataset.theme, 'light');
  assert.equal(env.root.dataset.themeMode, 'light');
  assert.equal(env.values.get('indusmova:theme'), '"light"');
  assert.match(env.attrs['aria-label'], /Light appearance/);

  env.window.IndusTheme.cycle();
  assert.equal(env.root.dataset.theme, 'dark');
  assert.equal(env.root.dataset.themeMode, 'dark');
});

test('global theme can be changed by another tab and follows system changes in auto mode', () => {
  const env = createThemeSandbox({ stored: '"light"', systemDark: false });
  assert.equal(env.root.dataset.theme, 'light');

  env.values.set('indusmova:theme', '"dark"');
  env.windowHandlers.get('storage')({ key: 'indusmova:theme', newValue: '"dark"' });
  assert.equal(env.root.dataset.theme, 'dark');
  assert.equal(env.research.dataset.theme, 'dark');

  env.window.IndusTheme.set('auto');
  assert.equal(env.root.dataset.theme, 'light');
  env.media.matches = true;
  env.mediaHandlers.get('change')();
  assert.equal(env.root.dataset.theme, 'dark');
  assert.equal(env.root.dataset.themeMode, 'auto');
});
