/* indusmova — POST /api/chat
 *
 * A Cloudflare Pages Function. It holds the OpenRouter keys on the server
 * — never in the page — and spreads requests across up to six of them.
 *
 * Rotation is deliberately simple and stateless-ish: each request starts
 * at the next slot in a module counter (plus a small random offset so two
 * isolates do not march in lockstep), then walks the remaining keys if the
 * chosen one refuses. A 429, a 401, a 5xx or a network error moves on to
 * the next key, so one exhausted key never becomes the whole site's
 * problem.
 *
 * If no key is configured the function answers 501 and the page falls back
 * to its own Wikipedia engine, which needs no key at all.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

let cursor = Math.floor(Math.random() * 6);

function keysFrom(env) {
  const keys = [];
  for (let i = 1; i <= 6; i += 1) {
    const value = env[`OPENROUTER_KEY_${i}`];
    if (typeof value === 'string' && value.trim()) keys.push(value.trim());
  }
  return keys;
}

/* The shape of an answer, keyed by the mode the page sends. The skill pack
   lives in the page; only its conclusion arrives here, so nothing about it
   is exposed or stored. */
const MODES = {
  support: 'Answer with care and without judgement. Do not diagnose. Do not invent facts. If the person needs real help, say so plainly and suggest a trusted person or professional.',
  study: 'Explain the idea first, then the steps. Keep it short and checkable. Never pretend to see an image you were not given.',
  research: 'Separate what is sourced from what is inference. Keep sources attached. If you are not certain, say so.',
  data: 'Define the measure before reading it. Report numerator, denominator and rate together. State uncertainty.',
  visual: 'One idea per chart or tile. Name the comparison and the source.',
  critique: 'Lead with the strongest point. Quote the weak thing and rewrite it.',
  code: 'Give the smallest change that fixes it, and say what to run to check it.',
  build: 'Give the shape first, then the smallest complete slice. Flag what needs approval.',
  report: 'Plain language, newest first, only what actually shipped.',
  organise: 'Group by one rule, name the buckets, move nothing without permission.',
  default: 'Answer directly and briefly. Prefer verifiable facts.',
};

function systemPrompt(mode) {
  return [
    'You are indusmova, a reading companion for an encyclopedia built from Wikipedia and Wikidata.',
    'Be concise. Prefer plain sentences over lists. Never invent a source, a number, a quote or an event.',
    'If you are unsure, say what you do not know. If the question is about a current or contested fact, say that it should be checked against the cited source.',
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
  const model = env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

  const body = {
    model,
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
          'X-Title': 'indusmova',
        },
        body: JSON.stringify(body),
      });
    } catch {
      lastStatus = 0;
      continue;                      // network error: try the next key
    }

    if (response.ok) {
      const data = await response.json().catch(() => null);
      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (reply) {
        // The slot number is returned so the page can show "key 3 of 6"
        // internally if it ever needs to; no key material leaves the server.
        return json({ reply, model, slot: index + 1, keys: keys.length });
      }
      lastStatus = 502;
      continue;
    }

    lastStatus = response.status;
    // 400 is about the request, not the key — retrying elsewhere is pointless.
    if (response.status === 400) return json({ error: 'bad-request', status: 400 }, 400);
  }

  return json({ error: 'all-keys-failed', status: lastStatus || 503 }, 503);
}

export async function onRequestGet() {
  return json({ error: 'method-not-allowed' }, 405);
}
