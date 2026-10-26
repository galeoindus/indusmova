/* Galeoindus — POST /api/chat
 *
 * A Cloudflare Pages Function. It is the only place the OpenRouter keys
 * live: they are read from the environment at request time and never reach
 * the page. Up to six keys are supported and they are used in rotation, so
 * one answer goes to one key and the next answer to the next key.
 *
 * If a key is rate-limited (429), rejected (401/403), broken (5xx) or the
 * request fails outright, the same question moves on to the next key rather
 * than failing. Only when every key has been tried does the page fall back
 * to its own encyclopedia engine, which needs no key at all.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/* A starting point that differs per isolate, so parallel instances do not
   march in step through the same key order. */
let cursor = Math.floor(Math.random() * 6);

function keysFrom(env) {
  const keys = [];
  for (let i = 1; i <= 6; i += 1) {
    const v = env[`OPENROUTER_KEY_${i}`];
    if (typeof v === 'string' && v.trim()) keys.push(v.trim());
  }
  return keys;
}

/* The shape of an answer, chosen by the mode the page sends. The skill pack
   itself stays in the page; only its conclusion travels, so nothing about it
   is exposed. */
const MODES = {
  support: 'Answer with care and without judgement. Do not diagnose. Do not invent facts. If the person needs real help, say so plainly and point them to a trusted person or professional.',
  study: 'Explain the idea first, then the steps. Keep it short and checkable.',
  research: 'Separate what is sourced from what is inference. Name the source. If you are not certain, say so.',
  plan: 'Plan before doing: question, measure, hypothesis, test.',
  check: 'Check counts, denominators, time windows and nulls before believing a number.',
  data: 'Define the measure before reading it. Give numerator, denominator and rate together. State uncertainty.',
  visual: 'One idea per chart. Name the comparison and the source.',
  critique: 'Lead with the strongest point. Quote the weak thing and rewrite it.',
  report: 'Plain language, newest first, only what actually shipped.',
  organise: 'Group by one rule, name the buckets, move nothing without permission.',
  code: 'Give the smallest change that fixes it, and the command to check it.',
  build: 'Give the shape first, then the smallest complete slice. Flag what needs approval.',
  default: 'Answer directly and briefly. Prefer verifiable facts.',
};

function systemPrompt(mode) {
  return [
    'You are Galeoindus, the conversation side of indusmova, an encyclopedia reader built on Wikipedia and Wikidata.',
    'Be concise and warm. Prefer plain sentences over long lists. Never invent a source, a number, a quote or an event.',
    'If you are unsure, say what you do not know. For current or contested facts, say it should be checked against the cited source.',
    MODES[mode] || MODES.default,
  ].join(' ');
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'bad-json' }, 400); }

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  if (!messages.length) return json({ error: 'no-messages' }, 400);

  const keys = keysFrom(env);
  if (!keys.length) return json({ error: 'no-keys' }, 501);

  const mode = typeof payload.mode === 'string' ? payload.mode : 'default';
  const body = {
    model: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt(mode) },
      ...messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    ],
    temperature: 0.3,
    max_tokens: 700,
  };

  const start = cursor++ % keys.length;
  let lastStatus = 0;

  for (let step = 0; step < keys.length; step += 1) {
    const index = (start + step) % keys.length;
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${keys[index]}`,
          'content-type': 'application/json',
          'HTTP-Referer': env.OPENROUTER_SITE || 'https://indusmova.pages.dev',
          'X-Title': 'Galeoindus',
        },
        body: JSON.stringify(body),
      });
    } catch {
      lastStatus = 0;
      continue;                       // network error: try the next key
    }

    if (response.ok) {
      const data = await response.json().catch(() => null);
      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (reply) {
        return json({ reply, model: body.model, slot: index + 1, keys: keys.length });
      }
      lastStatus = 502;
      continue;
    }

    lastStatus = response.status;
    // 400 is about the question, not the key — retrying elsewhere is pointless.
    if (response.status === 400) return json({ error: 'bad-request', status: 400 }, 400);
  }

  return json({ error: 'all-keys-failed', status: lastStatus || 503 }, 503);
}

export async function onRequestGet() {
  return json({ error: 'method-not-allowed' }, 405);
}
