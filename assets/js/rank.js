/* indusmova — deciding which sentences actually answer the question.
 *
 * Two rankers, in order of cost:
 *
 *   1. Keyword overlap (always on). Cheap, deterministic, no download. It
 *      weights rare words more than common ones (a rough IDF) and gives a
 *      small bonus to a sentence that opens a paragraph or carries a number.
 *
 *   2. Meaning ranking (opt-in, "Understand meaning"). Loads a small open
 *      sentence-embedding model through transformers.js, entirely in the
 *      browser, and re-orders the same sentences by cosine similarity to the
 *      question. If the model cannot load, we quietly keep the keyword order.
 *
 * Nothing here writes text: indusmova quotes published sentences, it does not
 * invent them.
 */

const STOP = new Set(`a an the and or but if then than that this these those of in on at to for from by with without as is are was were be been being am do does did doing have has had having
it its it's he she they them his her their you your we our us i me my mine not no nor so such too very can could should would may might must will shall
about into over under again further once here there when where why how all any both each few more most other some only own same also just
what which who whom whose whose when where why how many much whose`.split(/\s+/).filter(Boolean));

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Build an IDF table from a corpus of sentences. */
export function buildIdf(sentenceList) {
  const df = new Map();
  for (const s of sentenceList) {
    for (const term of new Set(tokenize(s))) df.set(term, (df.get(term) || 0) + 1);
  }
  const n = sentenceList.length || 1;
  const idf = new Map();
  for (const [term, count] of df) idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  return idf;
}

/** Keyword score of one sentence against the question, using an IDF table. */
export function keywordScore(question, sentence, idf) {
  const q = tokenize(question);
  if (!q.length) return 0;
  const terms = tokenize(sentence);
  if (!terms.length) return 0;
  const bag = new Map();
  for (const term of terms) bag.set(term, (bag.get(term) || 0) + 1);
  let score = 0;
  for (const term of q) {
    const weight = idf?.get(term) ?? 1;
    const hit = bag.get(term);
    if (hit) score += weight * (1 + Math.log(hit));
    // Partial credit for a shared stem, so "landing" meets "landed".
    else if (term.length > 4) {
      for (const other of bag.keys()) {
        if (other.length > 4 && (other.startsWith(term.slice(0, 4)) || term.startsWith(other.slice(0, 4)))) {
          score += weight * 0.35;
          break;
        }
      }
    }
  }
  // Normalise by question length so long questions don't dominate.
  score /= Math.sqrt(q.length);

  const text = sentence.trim();
  if (/\d{3,}|\b(1[0-9]{3}|20[0-9]{2})\b/.test(text)) score *= 1.12; // a date or figure
  if (/^[A-Z\u0900-\u097F]/.test(text) && text.split(/\s+/).length > 8) score *= 1.03;
  if (text.split(/\s+/).length < 5) score *= 0.7; // fragments
  return score;
}

/** Rank sentences by keyword relevance. Returns [{ text, score, index }]. */
export function rankByKeyword(question, sentenceList) {
  const idf = buildIdf(sentenceList);
  return sentenceList
    .map((text, index) => ({ text, index, score: keywordScore(question, text, idf) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

/* ------------------------------------------------- meaning ranking (opt-in) */

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

let extractorPromise = null;

/** Lazily load the embedding pipeline. Throws if the model cannot be fetched. */
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const mod = await import(/* @vite-ignore */ `${TRANSFORMERS_URL}`);
      mod.env.allowLocalModels = false;
      mod.env.useBrowserCache = true;
      return mod.pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
    })().catch((err) => {
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Rank sentences by meaning. Falls back to keyword order on any failure. */
export async function rankByMeaning(question, sentenceList) {
  const fallback = () => rankByKeyword(question, sentenceList);
  if (!sentenceList.length) return [];
  let extractor;
  try {
    extractor = await getExtractor();
  } catch {
    return fallback();
  }
  try {
    const inputs = [question, ...sentenceList];
    const output = await extractor(inputs, { pooling: 'mean', normalize: true });
    const dim = output.dims[output.dims.length - 1];
    const total = inputs.length;
    const vectors = [];
    for (let i = 0; i < total; i++) {
      vectors.push(output.data.slice(i * dim, (i + 1) * dim));
    }
    const qv = vectors[0];
    return sentenceList
      .map((text, index) => ({ text, index, score: cosine(qv, vectors[index + 1]) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
  } catch {
    return fallback();
  }
}

