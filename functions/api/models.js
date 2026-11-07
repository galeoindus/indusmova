/**
 * indusmova — the model menu.
 *
 * The chat lets a reader choose which OpenRouter model writes the answer, and
 * "Auto" must mean the cheapest one that works rather than a model somebody
 * hard-coded last year. So this endpoint publishes exactly what /api/ask will
 * accept: the allowlisted models (OPENROUTER_MODELS), each with its cost band,
 * its live OpenRouter price where the catalogue is reachable, and the id Auto
 * would pick right now.
 *
 * What it never publishes: API keys, secret values, provider errors or
 * anything about the caller. Prices are per one million tokens, read from
 * OpenRouter's public /models response — not invented here.
 */

import { modelMenu } from './ask.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=600',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function onRequestGet({ env = {} }) {
  const menu = await modelMenu(env);
  return json(menu);
}

export async function onRequest({ request, env = {} }) {
  if (request.method === 'GET' || request.method === 'HEAD') return onRequestGet({ env });
  return json({ error: 'method_not_allowed', message: 'Use GET.' }, 405);
}
