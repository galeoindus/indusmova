/* The model menu: cheap first, allowlisted, and never a secret in the reply. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { __test } from '../functions/api/ask.js';
import { onRequestGet as modelsGet } from '../functions/api/models.js';

const { modelCatalog, autoModel, isAllowedModel, allowedModelIds, modelMenu } = __test;

const CHEAPEST = 'meta-llama/llama-3.2-3b-instruct';
const DETAILED_CHEAP = 'openai/gpt-4o-mini';
const DEEP_CHEAP = 'anthropic/claude-3.5-haiku';

const originalFetch = globalThis.fetch;
function offlineFetch() {
  globalThis.fetch = async () => { throw new Error('offline'); };
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
}

test('the catalogue is ordered by cost band, cheapest first', () => {
  const ranks = { cheap: 0, balanced: 1, deep: 2 };
  const menu = modelCatalog({});
  const tiers = menu.map((m) => ranks[m.tier]);
  assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b));
  assert.equal(menu[0].tier, 'cheap');
});

test('auto picks the cheapest model that can answer at the chosen depth', () => {
  assert.equal(autoModel({}, 'quick'), CHEAPEST);
  assert.equal(autoModel({}, 'detailed'), DETAILED_CHEAP);
  assert.equal(autoModel({}, 'deep'), DEEP_CHEAP);
});

test('a pinned OPENROUTER_MODEL always wins', () => {
  assert.equal(autoModel({ OPENROUTER_MODEL: 'deepseek/deepseek-chat' }, 'quick'), 'deepseek/deepseek-chat');
});

test('OPENROUTER_MODEL_TIER can raise the floor but never lower it', () => {
  assert.equal(autoModel({ OPENROUTER_MODEL_TIER: 'balanced' }, 'detailed'), DEEP_CHEAP);
  // Asking for cheap on a Deep answer does not drop below the depth floor.
  assert.equal(autoModel({ OPENROUTER_MODEL_TIER: 'cheap' }, 'deep'), DEEP_CHEAP);
});

test('OPENROUTER_MODELS is the only menu a reader can choose from', () => {
  const env = { OPENROUTER_MODELS: 'openai/gpt-4o-mini, deepseek/deepseek-chat' };
  assert.deepEqual(allowedModelIds(env), ['openai/gpt-4o-mini', 'deepseek/deepseek-chat']);
  const ids = modelCatalog(env).map((m) => m.id);
  assert.deepEqual(ids.sort(), ['deepseek/deepseek-chat', 'openai/gpt-4o-mini']);
  assert.equal(isAllowedModel(env, 'anthropic/claude-3.5-sonnet'), false);
  assert.equal(isAllowedModel(env, 'openai/gpt-4o-mini'), true);
});

test('an unlisted model id in a request body is refused', () => {
  assert.equal(isAllowedModel({}, 'someone/expensive-model'), false);
  assert.equal(isAllowedModel({}, ''), false);
  assert.equal(isAllowedModel({}, 'openai/gpt-4o-mini'), true);
});

test('the catalogue drops models the account cannot actually use', () => {
  const menu = modelCatalog({}, ['openai/gpt-4o-mini']);
  assert.deepEqual(menu.map((m) => m.id), ['openai/gpt-4o-mini']);
});

test('an operator may allow a model this file has never heard of', () => {
  const menu = modelCatalog({ OPENROUTER_MODELS: 'acme/new-model' });
  assert.equal(menu.length, 1);
  assert.equal(menu[0].id, 'acme/new-model');
  assert.equal(isAllowedModel({ OPENROUTER_MODELS: 'acme/new-model' }, 'acme/new-model'), true);
});

test('/api/models publishes the menu, the auto pick and no secrets', async () => {
  offlineFetch();
  try {
    const res = await modelsGet({ env: { OPENROUTER_API_KEY_1: 'secret-value-1' } });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.models) && data.models.length > 0);
    assert.equal(data.auto, DETAILED_CHEAP);
    assert.equal(data.autoLabel, 'GPT-4o mini');
    const body = JSON.stringify(data);
    assert.equal(body.includes('secret-value-1'), false);
    assert.equal(/api[_-]?key/i.test(body), false);
  } finally {
    restoreFetch();
  }
});

test('the menu works with no OpenRouter key at all', async () => {
  offlineFetch();
  try {
    const menu = await modelMenu({});
    assert.ok(menu.models.length > 0);
    assert.equal(menu.openrouterConfigured, false);
    assert.equal(menu.models[0].price, null);
  } finally {
    restoreFetch();
  }
});
