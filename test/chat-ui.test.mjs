import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(ROOT, path), 'utf8');

const [html, js, css, logo] = await Promise.all([
  read('chat/index.html'),
  read('assets/js/chat-page.js'),
  read('assets/css/chat-redesign.css'),
  read('assets/img/indus-agent.svg'),
]);

test('the assistant has a dedicated brand mark in the rail and welcome state', () => {
  assert.match(html, /assets\/img\/indus-agent\.svg/);
  assert.match(css, /indus-agent\.svg/);
  assert.match(logo, /<svg[\s\S]*viewBox="0 0 96 96"/);
  assert.match(logo, /linearGradient/);
});

test('the composer remains inside the main scroll surface for empty and active chats', () => {
  assert.match(html, /<div class="scroll" id="main"[\s\S]*<div class="stage">[\s\S]*<div class="dock" id="dock">/);
  assert.match(html, /id="prompt"/);
  assert.match(html, /id="send"/);
});

test('research questions search Wikipedia for article extracts, descriptions and lead images', () => {
  assert.match(js, /generator:\s*'search'/);
  assert.match(js, /prop:\s*'extracts\|info\|pageimages\|description'/);
  assert.match(js, /pithumbsize:\s*'480'/);
  assert.match(js, /wikiImageUrl\(p\.thumbnail\?\.source\)/);
});

test('Wikipedia results render readable article cards with safe links and image fallback', () => {
  assert.match(js, /function renderArticleResults\(passages\)/);
  assert.match(js, /el\('a', 'src-card'\)/);
  assert.match(js, /src-excerpt/);
  assert.match(js, /wikiUrl\(s\.url\)/);
  assert.match(js, /media\.classList\.add\('is-placeholder'\)/);
});

test('small talk follows a conversation path and stays usable if the model endpoint is unavailable', () => {
  assert.match(js, /function isSmallTalk\(value\)/);
  assert.match(js, /mode:\s*'chat'/);
  assert.match(js, /function localSmallTalkReply\(question\)/);
  assert.match(js, /Indus fallback/);
});

test('the redesigned chat has responsive and reduced-motion layouts', () => {
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 580px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /body\.is-empty \.scroll \{ justify-content: center; \}/);
});
