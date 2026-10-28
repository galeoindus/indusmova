/*
 * The answer layer for the Research Desk.
 *
 * The desk lists sources; this turns the best of them into an answer, read
 * straight out of the article's own structure — its lead, then the sections
 * Wikipedia itself puts it in. Nothing is generated: every line is a sentence
 * from the article, chosen and ordered.
 *
 * Two Wikimedia calls do the work: `prop=sections` for the article's table of
 * contents, then `prop=text&section=N` for the first sentence of the sections
 * that carry substance. The lead comes from the search result the desk
 * already has, so a search costs one extra request plus one per section.
 */

const HOST = (lang) => `${lang}.wikipedia.org`;

/** Sections that never answer a question. */
const SKIP = /^(references|see also|notes|citations|footnotes|further reading|external links|bibliography|sources|works cited|gallery|explanatory notes|general sources)$/i;

const ABBR = /(?:^|\s)(?:c|ca|approx|e\.g|i\.e|etc|vs|dr|mr|mrs|ms|st|no|vol|pp|p|fig|al|cf|ed|trans)\.$/i;

const clean = (value, max = 4000) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

/** Plain text out of a section's HTML. */
function textOf(html) {
  return clean(String(html || '')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, ' ')      // citation markers
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[ edit \]/g, ' ')
    .replace(/&#91;\s*\d+\s*&#93;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'"));
}

/** Split a paragraph into sentences, without cutting at an abbreviation. */
export function sentences(text) {
  const pieces = String(text || '').split(/(?<=[.!?])\s+/);
  const merged = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && ABBR.test(last)) merged[merged.length - 1] = `${last} ${piece}`;
    else merged.push(piece);
  }
  return merged.map((s) => s.trim()).filter((s) => s.length > 30);
}

async function api(language, params) {
  const url = new URL(`https://${HOST(language)}/w/api.php`);
  Object.entries({ action: 'parse', format: 'json', formatversion: '2', origin: '*', ...params })
    .forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.href, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(clean(data.error.info || 'The source returned an error.', 200));
  return data?.parse;
}

/** The article's table of contents, in Wikipedia's own order. */
async function contents(language, title) {
  const parse = await api(language, { page: title, prop: 'sections' });
  const sections = parse?.sections || [];
  return sections
    .filter((s) => s.line && !SKIP.test(s.line) && !/^\d+$/.test(s.line))
    .slice(0, 6)
    .map((s) => ({ index: s.index, heading: s.line }));
}

/** The first sentence or two of one section. */
async function sectionLine(language, title, index) {
  const parse = await api(language, { page: title, prop: 'text', section: index });
  const text = textOf(parse?.text);
  if (!text) return '';
  const parts = sentences(text);
  if (!parts.length) return text.slice(0, 240);
  let line = parts[0];
  if (line.length < 110 && parts[1]) line = `${parts[0]} ${parts[1]}`;
  return line.slice(0, 420);
}

const WHEN_Q = /\b(when|what year|which year|in what year|date|how old)\b/i;
const NUM_Q = /\b(how many|how much|how long|population|cost|price|number of|largest|biggest|total)\b/i;
const HOW_Q = /\b(how does|how do|how did|how is|how are|how to|process|works|work)\b/i;
const WHO_Q = /\b(who|whose|whom)\b/i;

function score(text, question, index) {
  let n = 0;
  if (WHEN_Q.test(question) && /\b(1[0-9]{3}|20[0-9]{2})\b/.test(text)) n += 3;
  if (NUM_Q.test(question) && /\d/.test(text)) n += 2;
  if (HOW_Q.test(question) && /(by|through|using|process|begins|works|allows|enables|consists)/i.test(text)) n += 2;
  if (WHO_Q.test(question) && /\b(is|was|born|founded|led|became)\b/i.test(text)) n += 2;
  if (/\b(is|was|are|were|has|had)\b/.test(text)) n += 1;
  n += Math.min(2, text.length / 180);
  return n - index * 0.01;
}

/** Compose the answer parts from a lead and a set of topic lines. */
export function compose({ title, lead, topics = [], question = '', source }) {
  const opening = sentences(lead);
  let answer = opening[0] || clean(lead, 400);
  let consumed = 1;
  if (answer.length < 140 && opening[1]) { answer = `${opening[0]} ${opening[1]}`; consumed = 2; }

  const rest = opening.slice(consumed);
  const ranked = rest
    .map((text, i) => ({ text, score: score(text, question, i) }))
    .sort((a, b) => b.score - a.score);
  const points = ranked.slice(0, 4).map((x) => x.text).filter((t) => t.length > 30);

  return { title, question, answer, points, topics, source, at: Date.now() };
}

/** The answer as Markdown: the answer, then the topics, then the source. */
export function toMarkdown(a) {
  const out = [];
  out.push(`# ${a.title}`);
  out.push('');
  out.push(`> ${a.source?.url ? `[Wikipedia](${a.source.url})` : 'Wikipedia'} · ${a.source?.language || 'en'} · ${new Date(a.at).toLocaleString()}`);
  out.push('');
  out.push('## Answer');
  out.push('');
  out.push(a.answer || '—');
  out.push('');
  if (a.points?.length) {
    out.push('## Key points');
    out.push('');
    a.points.forEach((p, i) => out.push(`${i + 1}. ${p}`));
    out.push('');
  }
  if (a.topics?.length) {
    out.push('## Topics');
    out.push('');
    a.topics.forEach((t) => {
      out.push(`### ${t.heading}`);
      out.push('');
      out.push(t.line);
      out.push('');
    });
  }
  out.push('## Source');
  out.push('');
  out.push(`- ${a.title} — Wikipedia (${a.source?.language || 'en'})`);
  if (a.source?.url) out.push(`- ${a.source.url}`);
  out.push('');
  out.push('---');
  out.push('_Every line above is a sentence from the article, selected and ordered — not written._');
  return out.join('\n');
}

/** Build the answer for a search: the top result's lead, plus its sections. */
export async function answerFor(results, question, language) {
  if (!results?.length) return null;
  const top = results[0];
  const lang = language || top.language || 'en';

  let topics = [];
  try {
    const list = await contents(lang, top.title);
    const lines = await Promise.all(list.map(async (s) => {
      try { return { heading: s.heading, line: await sectionLine(lang, top.title, s.index) }; }
      catch { return null; }
    }));
    topics = lines.filter((t) => t && t.line).slice(0, 4);
  } catch { topics = []; }

  return compose({
    title: top.title,
    lead: top.extract || top.snippet || '',
    topics,
    question,
    source: { url: top.url, language: lang, title: top.title },
  });
}
