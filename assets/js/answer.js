/* indusmova — composing an answer out of an article.
 *
 * Given a question and a Wikipedia article, this produces the object every
 * answer view renders:
 *
 *   core       the two or three sentences that most directly answer it
 *   keyPoints  the strongest supporting sentences, with their section
 *   topics     the article broken into topic blocks, each ranked by relevance
 *   facts      the label/value rows from the infobox
 *   sources    what was read, with links
 *
 * The sentences are always quoted from the article — ranking only chooses the
 * order, it never writes. `deep` switches the ranking from keywords to the
 * optional on-device meaning model.
 */

import { splitArticle, sentences, textOf } from './parse.js';
import { rankByKeyword, rankByMeaning } from './rank.js';
import { DEPTHS } from './config.js';

/**
 * Near-duplicate detection.
 *
 * Wikipedia repeats a sentence across a lead and a section, and our sentence
 * splitter can leave a fragment of the previous sentence stuck to the front of
 * the next one. Comparing the sets of word 3-grams (Jaccard) collapses both
 * cases without needing the strings to match exactly.
 */
function shingles(text) {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i < words.length - 2; i++) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  if (!set.size && words.length) set.add(words.join(' '));
  return set;
}

function similar(a, b) {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of small) if (large.has(gram)) shared++;
  return shared / small.size > 0.6;
}

/** Keep the first of each group of near-identical strings. */
export function dedupe(texts, limit = Infinity) {
  const kept = [];
  const prints = [];
  for (const text of texts) {
    const sig = shingles(text);
    if (prints.some((p) => similar(sig, p))) continue;
    prints.push(sig);
    kept.push(text);
    if (kept.length >= limit) break;
  }
  return kept;
}

/** Pull label/value pairs out of a Wikipedia infobox. */
export function factsFromInfobox(infoboxHtml) {
  if (!infoboxHtml) return [];
  const doc = new DOMParser().parseFromString(infoboxHtml, 'text/html');
  const rows = [...doc.querySelectorAll('tr')];
  const facts = [];
  for (const tr of rows) {
    const th = tr.querySelector('th');
    const td = tr.querySelector('td');
    if (!th || !td) continue;
    const label = textOf(th);
    const value = textOf(td);
    if (!label || !value || label.length > 60 || value.length > 220) continue;
    if (/^(hide|show)$/i.test(label)) continue;
    facts.push({ label, value });
    if (facts.length >= 12) break;
  }
  return facts;
}

/**
 * Build the answer.
 *
 * @param {object} args
 * @param {string} args.question  the user's question, in any language
 * @param {HTMLElement} args.root cleaned article container (from parse.clean)
 * @param {Array} args.sections   section metadata from the API
 * @param {string} [args.depth]   quick | detailed | deep
 * @param {boolean} [args.deep]   use the on-device meaning model
 */
export async function composeAnswer({ question, root, sections = [], depth = 'detailed', deep = false, lang = 'en', title = '', mode = 'ask', maxSections = null }) {
  const parts = splitArticle(root, sections);
  const preset = DEPTHS[depth] || DEPTHS.detailed;

  const leadSentences = sentences(parts.leadText);
  const sectionTexts = parts.sections.map((s) => ({
    id: s.id, line: s.line, number: s.number || '', sentences: sentences(s.text), images: s.images || [],
  }));

  // Everything the question could be answered from, tagged with its section.
  const pool = [
    ...leadSentences.map((text) => ({ text, section: '', sectionId: '' })),
    ...sectionTexts.flatMap((s) => s.sentences.map((text) => ({ text, section: s.line, sectionId: s.id }))),
  ];

  let ranked;
  try {
    ranked = deep
      ? await rankByMeaning(question, pool.map((p) => p.text))
      : rankByKeyword(question, pool.map((p) => p.text));
  } catch {
    ranked = rankByKeyword(question, pool.map((p) => p.text));
  }

  const ordered = ranked
    .filter((r) => r.score > 0)
    .map((r) => ({ ...pool[r.index], score: r.score }));

  const byQuestion = ordered.length ? ordered : pool.map((p, index) => ({ ...p, index, score: 0 }));

  // The core answer. In ask mode it is the sentences that best match the
  // question; opening an article directly, the definition in the lead is the
  // answer, so that is what leads.
  const core = mode === 'article'
    ? dedupe(leadSentences, preset.sentences)
    : dedupe(byQuestion.map((p) => p.text), preset.sentences);

  // Key points: the next most useful sentences, with the section they came from.
  const keyPointTexts = mode === 'article'
    ? dedupe([...leadSentences.slice(core.length), ...sectionTexts.map((s) => s.sentences[0]).filter(Boolean)], 6)
    : dedupe(byQuestion.map((p) => p.text), 6);
  const keyPoints = keyPointTexts.map((text) => {
    const hit = byQuestion.find((p) => p.text === text) || {};
    return { text, section: hit.section || '', sectionId: hit.sectionId || '' };
  });

  // Topic blocks. Each carries a short read (two sentences) and the full
  // section, so the breakdown opens brief and extends on demand.
  const topicScores = sectionTexts.map((s) => {
    const score = s.sentences.reduce((sum, text) => {
      const hit = ordered.find((o) => o.text === text);
      return sum + (hit ? hit.score : 0);
    }, 0) / Math.max(1, s.sentences.length);
    return { ...s, score };
  });
  const byRelevance = mode !== 'article' && topicScores.some((s) => s.score > 0);
  const orderedTopics = byRelevance ? [...topicScores].sort((a, b) => b.score - a.score) : topicScores;
  // An article keeps its whole structure; an answer keeps the most relevant part.
  const limit = maxSections ?? preset.sections;
  const topics = orderedTopics
    .slice(0, limit)
    .map((s, i) => {
      const points = dedupe(s.sentences, Math.max(4, preset.sentences));
      return {
        id: s.id,
        title: s.line,
        // Wikipedia's own numbering, so a subsection reads "2.1" and not "7".
        number: s.number || String(i + 1),
        short: points.slice(0, 2),
        full: points,
        points,
        images: s.images || [],
        score: s.score,
      };
    })
    .filter((s) => s.points.length);

  return {
    question,
    mode,
    lang,
    title,
    lead: parts.leadHtml,
    leadText: parts.leadText,
    core,
    keyPoints,
    topics,
    facts: factsFromInfobox(parts.infoboxHtml),
    infoboxHtml: parts.infoboxHtml,
    images: parts.images,
    leadImage: parts.images[0] || null,
    tables: parts.tables,
    citations: parts.citations.slice(0, 20),
    references: parts.references || [],
    sections: parts.sections.map((s) => ({ id: s.id, line: s.line, level: s.level })),
    rankedCount: ordered.length,
    // Transparency: what the answer was actually built from.
    method: {
      depth: preset.id,
      rankedBy: deep ? 'meaning' : 'relevance',
      sentencesConsidered: pool.length,
      sentencesMatched: ordered.length,
      sectionsRead: parts.sections.length,
      topicsShown: topics.length,
      words: parts.leadText.split(/\s+/).filter(Boolean).length,
    },
  };
}
