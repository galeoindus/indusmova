/* indusmova — the translation provider layer.
 *
 * One place that talks to a translation service, so the two paths that need
 * one (the Translate tab and the "read the full English article" offer) cannot
 * drift apart in how they chunk, retry, fail or label their output.
 *
 * What it guarantees, because a reader has to be able to trust the result:
 *
 *   · Nothing is clipped. Text is split on sentence boundaries and on the
 *     provider's own byte limit, and every piece is translated before the
 *     original is replaced. A partial result is reported as partial, never
 *     dressed up as complete.
 *   · The source language is stated, not assumed. The old MyMemory fallback
 *     hard-coded English, so a Hindi article that fell back came back as
 *     nonsense. It now takes the real source language.
 *   · A failure is bounded. Requests back off with jitter, honour Retry-After,
 *     and a provider that keeps failing is taken out of rotation for a while
 *     instead of being hammered for every segment of a long article.
 *
 * Both endpoints used here are keyless and already allowed by the site's CSP.
 * They are best-effort public services: the UI says so, and this module never
 * pretends otherwise by silently dropping text.
 */

const GOOGLE_BATCH = 'https://translate.googleapis.com/translate_a/t';
const GOOGLE_SINGLE = 'https://translate.googleapis.com/translate_a/single';
const MEMORY = 'https://api.mymemory.translated.net/get';

/** Google accepts far more, but a small batch keeps a failure cheap to retry. */
const BATCH_MAX_ITEMS = 24;
const BATCH_MAX_CHARS = 3_200;
/**
 * How many batches are in flight at once.
 *
 * Translating a long article one batch at a time meant a reader waited for
 * every round trip in turn — a sixty-section article was sixty waits end to
 * end. Four at a time turns that into fifteen, and the results are still
 * applied by index, so the text lands in the same order it would have.
 */
const BATCH_CONCURRENCY = 4;
/** MyMemory documents a 500-byte ceiling per query; stay under it. */
const MEMORY_MAX_BYTES = 450;
const MAX_RETRIES = 2;
const BREAKER_MS = 45_000;
const BREAKER_FAILURES = 3;

const memo = new Map();
const memoKey = (source, target, text) => `${source}\u0000${target}\u0000${text}`;

/* -------------------------------------------------- the kept translations
 *
 * A reader who translates an article, changes their mind, picks another
 * language and comes back was paying for every passage twice. The memo below
 * only lived as long as the page did, so a reload started from nothing and
 * the same article took the same half-minute again.
 *
 * Finished translations are now kept in the browser, keyed by source, target
 * and the passage itself. Nothing else is stored — no titles, no addresses,
 * no identifiers — and the whole store is capped and evicted oldest-first, so
 * it cannot grow without bound. A cache miss behaves exactly as before.
 */
const STORE_KEY = 'indusmova:tr-cache:v1';
const STORE_MAX_ENTRIES = 900;
let storeLoaded = false;
let storeDirty = false;

function hashKey(value) {
  // FNV-1a over the memo key: short, stable, and good enough to avoid a
  // collision on a few thousand distinct passages.
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function loadStore() {
  if (storeLoaded) return;
  storeLoaded = true;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) memo.set(key, value);
    }
  } catch { /* a blocked or corrupt store is simply an empty one */ }
}

function saveStore() {
  if (!storeDirty) return;
  storeDirty = false;
  try {
    // Keep the most recently written entries; the map's insertion order is
    // the order they were translated in.
    const entries = [...memo.entries()].slice(-STORE_MAX_ENTRIES);
    const out = {};
    for (const [key, value] of entries) out[key.length > 120 ? hashKey(key) : key] = value;
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch { /* quota or private mode: the cache is a bonus, never a blocker */ }
}

const breaker = new Map(); // provider -> { failures, openUntil }

function isOpen(provider) {
  const state = breaker.get(provider);
  return Boolean(state && state.openUntil > Date.now());
}

function noteFailure(provider) {
  const state = breaker.get(provider) || { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (state.failures >= BREAKER_FAILURES) {
    state.openUntil = Date.now() + BREAKER_MS;
    state.failures = 0;
  }
  breaker.set(provider, state);
}

function noteSuccess(provider) {
  breaker.delete(provider);
}

/** A pause that grows with the attempt, with jitter so retries do not sync. */
function backoff(attempt, retryAfter) {
  if (retryAfter) return Math.min(8000, retryAfter * 1000);
  return Math.min(4000, 400 * 2 ** attempt) + Math.random() * 250;
}

/** UTF-8 byte length, which is what the provider limits are written in. */
export function byteLength(text) {
  return new TextEncoder().encode(String(text || '')).length;
}

/**
 * Split text into pieces that each fit a byte budget, preferring sentence
 * boundaries. A single sentence longer than the budget is split on words; a
 * single word longer than the budget is split on characters. Nothing is lost.
 */
export function splitByBytes(text, maxBytes = MEMORY_MAX_BYTES) {
  const value = String(text || '').trim();
  if (!value) return [];
  if (byteLength(value) <= maxBytes) return [value];

  const pieces = [];
  let buffer = '';
  const push = () => { if (buffer.trim()) pieces.push(buffer.trim()); buffer = ''; };

  for (const sentence of value.split(/(?<=[.!?।])\s+/)) {
    if (byteLength(sentence) <= maxBytes) {
      if (byteLength(`${buffer} ${sentence}`) > maxBytes) push();
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
      continue;
    }
    push();
    for (const word of sentence.split(/\s+/)) {
      if (byteLength(`${buffer} ${word}`) > maxBytes && buffer) push();
      if (byteLength(word) > maxBytes) {
        let chunk = '';
        for (const char of word) {
          if (byteLength(chunk + char) > maxBytes && chunk) { pieces.push(chunk); chunk = ''; }
          chunk += char;
        }
        if (chunk) buffer = buffer ? `${buffer} ${chunk}` : chunk;
      } else {
        buffer = buffer ? `${buffer} ${word}` : word;
      }
    }
    push();
  }
  push();
  return pieces;
}

async function request(url, signal, attempt = 0) {
  const res = await fetch(url, { signal });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= MAX_RETRIES) throw new Error(`translate ${res.status}`);
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    await new Promise((r) => setTimeout(r, backoff(attempt, retryAfter)));
    return request(url, signal, attempt + 1);
  }
  if (!res.ok) throw new Error(`translate ${res.status}`);
  return res;
}

/* ------------------------------------------------------------- providers */

/** Google's batch endpoint: repeated `q`, one answer per `q`, in order. */
async function googleBatch(texts, source, target, signal) {
  const url = new URL(GOOGLE_BATCH);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', source || 'auto');
  url.searchParams.set('tl', target);
  for (const text of texts) url.searchParams.append('q', text);
  const res = await request(url.toString(), signal);
  const data = await res.json();
  if (Array.isArray(data) && data.length === texts.length) {
    return data.map((item) => (Array.isArray(item) ? String(item[0] ?? '') : String(item ?? '')));
  }
  throw new Error('translate shape');
}

async function googleSingle(text, source, target, signal) {
  const url = new URL(GOOGLE_SINGLE);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', source || 'auto');
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  const res = await request(url.toString(), signal);
  const data = await res.json();
  const parts = data?.[0];
  if (!Array.isArray(parts)) throw new Error('translate shape');
  return parts.map((p) => (Array.isArray(p) ? p[0] : '')).join('');
}

/**
 * MyMemory, used only when Google will not answer.
 *
 * It gets the real source language and byte-sized pieces; every piece has to
 * come back before the caller is allowed to replace the original, so a long
 * paragraph can never be silently shortened.
 */
async function myMemory(text, source, target, signal) {
  const pieces = splitByBytes(text, MEMORY_MAX_BYTES);
  const out = [];
  for (const piece of pieces) {
    const url = new URL(MEMORY);
    url.searchParams.set('q', piece);
    url.searchParams.set('langpair', `${String(source || 'en').split('-')[0]}|${String(target).split('-')[0]}`);
    const res = await request(url.toString(), signal);
    const data = await res.json();
    const value = data?.responseData?.translatedText;
    if (!value || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(value)) throw new Error('mymemory refused');
    out.push(value);
  }
  return out.join(' ');
}

/* --------------------------------------------------------------- the API */

/**
 * Translate a list of strings.
 *
 * Returns one entry per input: `{ text, provider, status }` where status is
 * `translated`, `unchanged` (nothing to do) or `failed` (leave the original in
 * place). It never returns a shortened or invented string in place of one it
 * could not translate.
 */
export async function translateTexts(texts, target, {
  source = 'auto', signal, onProgress, maxRequests = 120,
} = {}) {
  loadStore();
  const out = texts.map((text) => ({ text, provider: '', status: 'unchanged' }));
  const pending = [];

  texts.forEach((text, index) => {
    const value = String(text ?? '');
    if (!value.trim() || value.trim().length < 2) return;
    const hit = memo.get(memoKey(source, target, value));
    if (hit != null) {
      out[index] = { text: hit, provider: 'cache', status: 'translated' };
      return;
    }
    pending.push({ index, text: value });
  });
  if (!pending.length) { onProgress?.(texts.length, texts.length); return out; }

  let requests = 0;
  let done = texts.length - pending.length;
  const advance = (n = 1) => { done += n; onProgress?.(done, texts.length); };

  const apply = (item, value, provider) => {
    if (typeof value !== 'string' || !value.trim()) return false;
    out[item.index] = { text: value, provider, status: 'translated' };
    memo.set(memoKey(source, target, item.text), value);
    storeDirty = true;
    return true;
  };

  // Cut the pending text into batches first, so they can be issued together.
  const batches = [];
  for (let start = 0; start < pending.length;) {
    const batch = [];
    let chars = 0;
    // Keep each batch inside the character budget as well as the item count.
    while (start < pending.length && batch.length < BATCH_MAX_ITEMS) {
      const item = pending[start];
      if (batch.length && chars + item.text.length > BATCH_MAX_CHARS) break;
      batch.push(item);
      chars += item.text.length;
      start += 1;
    }
    batches.push(batch);
  }

  /** One batch: the parallel endpoint first, then the singles for stragglers. */
  const runBatch = async (batch) => {
    if (signal?.aborted) return;
    if (!isOpen('google') && requests < maxRequests) {
      requests += 1;
      try {
        const answers = await googleBatch(batch.map((b) => b.text), source, target, signal);
        batch.forEach((item, i) => apply(item, answers[i], 'google'));
        noteSuccess('google');
        advance(batch.length);
        // Anything the batch did not return goes through the single path.
        for (const item of batch) {
          if (out[item.index].status !== 'translated') {
            await translateOne(item, source, target, signal, apply, () => { requests += 1; });
          }
        }
        return;
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        noteFailure('google');
      }
    }

    for (const item of batch) {
      if (signal?.aborted) return;
      await translateOne(item, source, target, signal, apply, () => { requests += 1; });
      advance(1);
    }
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < batches.length) {
      if (signal?.aborted) return;
      const batch = batches[cursor];
      cursor += 1;
      await runBatch(batch);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, worker),
  );

  // Everything the providers could not do stays as the original text, marked
  // so the caller can show it as untranslated rather than pretending.
  for (const item of pending) {
    if (out[item.index].status !== 'translated') out[item.index].status = 'failed';
  }
  saveStore();
  onProgress?.(texts.length, texts.length);
  return out;
}

async function translateOne(item, source, target, signal, apply, countRequest) {
  if (!isOpen('google')) {
    countRequest();
    try {
      apply(item, await googleSingle(item.text, source, target, signal), 'google');
      noteSuccess('google');
      return;
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      noteFailure('google');
    }
  }
  if (!isOpen('mymemory')) {
    countRequest();
    try {
      apply(item, await myMemory(item.text, source, target, signal), 'mymemory');
      noteSuccess('mymemory');
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      noteFailure('mymemory');
    }
  }
}

/** Forget memoised strings and any open breaker. Used by the tests. */
export function resetTranslationState() {
  memo.clear();
  breaker.clear();
  storeLoaded = true;
  storeDirty = false;
}
