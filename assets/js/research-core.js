/*
 * IndusMova public-source search core.
 * Browser-only: direct requests to Wikimedia's public API; no backend or AI model.
 */
const LANGUAGES = new Set(['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'sa']);

export const LANGUAGE_NAMES = {
  en: 'English', hi: 'हिन्दी', bn: 'বাংলা', ta: 'தமிழ்', te: 'తెలుగు', mr: 'मराठी',
  gu: 'ગુજરાતી', kn: 'ಕನ್ನಡ', ml: 'മലയാളം', pa: 'ਪੰਜਾਬੀ', ur: 'اردو', sa: 'संस्कृतम्',
};

export function cleanText(value, max = 3000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, number) => {
      const code = Number(number);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([\da-f]+);/gi, (_match, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

export function stripMarkup(text) {
  return cleanText(decodeEntities(String(text || '').replace(/<[^>]*>/g, ' ')), 1400);
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch { return ''; }
}

function apiUrl(language, params) {
  const code = LANGUAGES.has(language) ? language : 'en';
  const url = new URL(`https://${code}.wikipedia.org/w/api.php`);
  Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  return url.href;
}

async function readJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
  if (response.status === 429) throw new Error('The public source is receiving too many requests. Please wait a moment and try again.');
  if (!response.ok) throw new Error(`Wikipedia could not complete this search (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.error) throw new Error(cleanText(data.error.info || 'The public source returned an error.', 300));
  return data;
}

/** Retrieve article search hits and their lead excerpts, without generating/synthesizing an answer. */
export async function searchPublicSources({ query, language = 'en', limit = 5, signal } = {}) {
  const q = cleanText(query, 300);
  if (!q) throw new Error('Enter a topic or question to search.');
  const lang = LANGUAGES.has(language) ? language : 'en';
  const count = Math.max(3, Math.min(10, Number(limit) || 5));

  const searchData = await readJson(apiUrl(lang, {
    action: 'query', list: 'search', srsearch: q, srnamespace: 0,
    srlimit: count, srprop: 'snippet|wordcount|timestamp',
  }), signal);
  const hits = (searchData?.query?.search || []).slice(0, count);
  if (!hits.length) return { query: q, language: lang, sources: [], searchedAt: Date.now(), totalHits: 0 };

  const articleData = await readJson(apiUrl(lang, {
    action: 'query', prop: 'extracts|info', inprop: 'url', exintro: 1, explaintext: 1,
    exchars: 1500, redirects: 1, titles: hits.map((hit) => hit.title).join('|'),
  }), signal);
  const pages = articleData?.query?.pages || [];
  const byTitle = new Map(pages.map((page) => [String(page.title || '').toLocaleLowerCase(), page]));
  const sources = hits.map((hit, index) => {
    const page = byTitle.get(String(hit.title || '').toLocaleLowerCase()) || pages[index] || {};
    const title = cleanText(page.title || hit.title, 220);
    const fallbackUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    return {
      id: `W${index + 1}`,
      title,
      url: safeHttpUrl(page.fullurl) || fallbackUrl,
      snippet: stripMarkup(hit.snippet || ''),
      extract: cleanText(page.extract || stripMarkup(hit.snippet || ''), 1600),
      wordCount: Number(hit.wordcount) > 0 ? Number(hit.wordcount) : null,
      lastUpdated: hit.timestamp || null,
      language: lang,
      sourceName: 'Wikipedia',
    };
  }).filter((source) => source.title && source.url);
  return { query: q, language: lang, sources, searchedAt: Date.now(), totalHits: hits.length };
}

export function formatCitation(source) {
  const title = cleanText(source?.title || 'Untitled source', 220);
  const url = safeHttpUrl(source?.url);
  return url ? `${title}. Wikipedia (${source?.language || 'en'}). ${url}` : title;
}

export function sourceMarkdown(source) {
  const title = cleanText(source?.title || 'Untitled source', 220);
  const url = safeHttpUrl(source?.url);
  const snippet = cleanText(source?.snippet || '', 1200);
  const extract = cleanText(source?.extract || '', 1500);
  return `## ${title}\n\n${snippet ? `**Search snippet:** ${snippet}\n\n` : ''}${extract ? `${extract}\n\n` : ''}${url ? `[Open original article](${url})` : ''}\n`;
}
