/**
 * POST /api/ask — the Cloudflare Workers AI binding.
 *
 * This is the one place on indusmova where a model writes a sentence. It is
 * deliberately small and deliberately grounded:
 *
 *   · the caller sends the question and the passages it found;
 *   · the model is told to answer only from those passages and to say so
 *     when they do not contain the answer;
 *   · every sentence it returns must end with the passage number it came
 *     from, so the reader can check it;
 *   · if the AI binding is not configured, the function says so plainly
 *     instead of failing with a stack trace.
 *
 * Enable the binding in Cloudflare (Pages → Settings → Functions → Bindings)
 * as a Workers AI binding named AI, or let wrangler.toml declare it.
 */

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

const SYSTEM = `You are the answer engine for indusmova, a reading site whose
every claim must be traceable to a source.

Rules, without exception:
1. Answer ONLY from the passages given to you. Never add outside knowledge.
2. End every sentence with the number of the passage it came from, like [1].
3. If the passages do not contain the answer, reply exactly:
   "The sources provided do not contain this answer."
4. Write in the language the question is asked in.
5. Be direct. Two or three sentences for a simple question, at most six for
   a broad one. No preamble, no restating the question.`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

export async function onRequestPost({ request, env }) {
  if (!env?.AI) {
    return json({
      error: 'no_binding',
      message:
        'The Workers AI binding is not configured for this project. Add an AI binding named AI in Cloudflare Pages → Settings → Functions → Bindings, then redeploy.',
    }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request', message: 'Send a JSON body.' }, 400);
  }

  const question = String(body?.question || '').trim().slice(0, 800);
  const passages = Array.isArray(body?.passages)
    ? body.passages.slice(0, 6).map((p, i) => ({
        n: i + 1,
        title: String(p?.title || '').slice(0, 200),
        text: String(p?.text || '').slice(0, 1600),
      })).filter((p) => p.text)
    : [];

  if (!question) return json({ error: 'bad_request', message: 'A question is required.' }, 400);
  if (!passages.length) {
    return json({ error: 'no_sources', message: 'Send at least one passage for the model to read.' }, 400);
  }

  const sourceBlock = passages
    .map((p) => `[${p.n}] ${p.title}\n${p.text}`)
    .join('\n\n');

  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Question: ${question}\n\nPassages:\n${sourceBlock}` },
      ],
      max_tokens: 700,
      temperature: 0.2,
    });

    const answer = String(result?.response || '').trim();
    if (!answer) return json({ error: 'empty', message: 'The model returned nothing.' }, 502);

    return json({
      answer,
      model: MODEL,
      sources: passages.map((p) => ({ n: p.n, title: p.title })),
    });
  } catch (error) {
    return json({
      error: 'model_failed',
      message: String(error?.message || 'The model call failed.'),
    }, 502);
  }
}

/** A GET is a health check: is the binding wired up? */
export async function onRequestGet({ env }) {
  return json({ ok: Boolean(env?.AI), model: MODEL, binding: env?.AI ? 'AI' : null });
}
