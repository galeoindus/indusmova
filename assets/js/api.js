/* indusmova — the Wikimedia client.
 *
 * Everything indusmova knows comes from the public Wikimedia APIs, called
 * straight from the browser (they send permissive CORS headers; the Action API
 * just needs `origin=*`). No keys, no server, no proxy.
 *
 *   Wikipedia Action API   search, parse, extracts, random, prefix search
 *   Wikipedia REST API     summaries, related, on-this-day, featured, pageviews
 *   Wikidata               entity data
 *   Wikimedia Commons      image licences and credits
 *
 * Every call goes through `get()` so caching, aborting and error shaping live
 * in one place.
 */

import { cleanUrl } from './ui.js';

const WIKI_API = 'https://{lang}.wikipedia.org/w/api.php';
const WIKI_REST = 'https://{lang}.wikipedia.org/api/rest_v1';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

const DEFAULT_LANG = 'en';
const TTL = {
  search: 5 * 60e3,
  summary: 30 * 60e3,
  article: 60 * 60e3,
  feed: 60 * 60e3,
  pageviews: 60 * 60e3,
  wikidata: 6 * 60 * 60e3,
  random: 0,
};

const cache = new Map(); // key -> { at, ttl, value }
const inflight = new Map(); // key -> Promise

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.ttl && Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value, ttl) {
  cache.set(key, { at: Date.now(), ttl, value });
  // Keep the map from growing without bound on a long session.
  if (cache.size > 400) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
    for (const [k] of oldest) cache.delete(k);
  }
}

export class ApiError extends Error {
  constructor(message, { status = 0, url = '', cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.cause = cause;
  }
}

async function get(url, { ttl = 0, signal, as = 'json', retries = 1 } = {}) {
  const key = `${as}:${url}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const run = (async () => {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          signal,
          headers: { Accept: as === 'json' ? 'application/json' : 'text/html' },
          referrerPolicy: 'no-referrer',
        });
        if (!res.ok) {
          // A 404 from a summary/parse endpoint is a real answer, not a fault.
          if (res.status === 404) throw new ApiError('not-found', { status: 404, url });
          throw new ApiError(`HTTP ${res.status}`, { status: res.status, url });
        }
        const value = as === 'json' ? await res.json() : await res.text();
        if (ttl) cacheSet(key, value, ttl);
        return value;
      } catch (err) {
        lastErr = err;
        if (err && err.name === 'AbortError') throw err;
        if (err instanceof ApiError && err.status === 404) throw err;
        if (attempt < retries) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
    throw lastErr instanceof ApiError
      ? lastErr
      : new ApiError('network', { url, cause: lastErr });
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

function actionUrl(lang, params) {
  const url = new URL(WIKI_API.replace('{lang}', lang || DEFAULT_LANG));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  return url.toString();
}

function restUrl(lang, path) {
  return `${WIKI_REST.replace('{lang}', lang || DEFAULT_LANG)}${path}`;
}

/** Normalise a REST summary/related payload into the shape views expect. */
function normalisePage(page) {
  if (!page) return null;
  const thumb = page.thumbnail || page.originalimage || null;
  // The featured/related feeds sometimes hand back titles with underscores.
  const title = (page.title || page.normalizedtitle || '').replace(/_/g, ' ');
  return {
    title,
    displayTitle: (page.displaytitle || page.titles?.display || page.title || '').replace(/_/g, ' '),
    description: page.description || '',
    extract: page.extract || '',
    thumb: thumb ? { src: cleanUrl(thumb.source || thumb.url), width: thumb.width, height: thumb.height } : null,
    lang: page.lang || '',
    dir: page.dir || 'ltr',
    url: page.content_urls?.desktop?.page || '',
    wikidataId: page.wikibase_item || '',
    timestamp: page.timestamp || '',
  };
}

/* ------------------------------------------------------------------ search */

/** Full-text search. Returns [{ title, snippet, size, wordcount, timestamp }]. */
export async function search(lang, query, { limit = 12, signal } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = actionUrl(lang, {
    action: 'query', list: 'search', srsearch: q, srlimit: limit,
    srprop: 'snippet|wordcount|timestamp',
  });
  const data = await get(url, { ttl: TTL.search, signal });
  return (data.query?.search || []).map((row) => ({
    title: row.title,
    snippet: row.snippet || '',
    wordcount: row.wordcount || 0,
    timestamp: row.timestamp || '',
  }));
}

/** Type-ahead suggestions. Returns [{ title, description, thumb }]. */
export async function suggest(lang, query, { limit = 7, signal } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = actionUrl(lang, {
    action: 'query', generator: 'prefixsearch', gpssearch: q, gpslimit: limit,
    prop: 'pageimages|description', piprop: 'thumbnail', pithumbsize: 96,
    redirects: 1,
  });
  const data = await get(url, { ttl: TTL.search, signal });
  const pages = data.query?.pages || [];
  return pages.map((p) => ({
    title: p.title,
    description: p.description || '',
    thumb: p.thumbnail ? cleanUrl(p.thumbnail.source) : '',
  }));
}

/** Resolve a free-text query to the best matching article title. */
export async function resolveTitle(lang, query, { signal } = {}) {
  const q = String(query || '').trim();
  if (!q) return '';
  try {
    const exact = await get(actionUrl(lang, { action: 'query', titles: q, redirects: 1 }), { ttl: TTL.summary, signal });
    const page = exact.query?.pages?.[0];
    if (page && !page.missing && page.title) return page.title;
  } catch { /* fall through to search */ }
  const hits = await search(lang, q, { limit: 1, signal });
  return hits[0]?.title || q;
}

/* --------------------------------------------------------------- summaries */

export async function summary(lang, title, { signal } = {}) {
  if (!title) return null;
  const url = restUrl(lang, `/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`);
  const data = await get(url, { ttl: TTL.summary, signal });
  return normalisePage(data);
}

/** Summaries for many titles at once (Action API), keyed by title. */
export async function summaries(lang, titles, { signal } = {}) {
  const list = [...new Set((titles || []).filter(Boolean))];
  if (!list.length) return new Map();
  const out = new Map();
  const CHUNK = 20;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const url = actionUrl(lang, {
      action: 'query', titles: chunk.join('|'), redirects: 1,
      prop: 'extracts|pageimages|description|info', exintro: 1, explaintext: 1,
      exchars: 320, piprop: 'thumbnail', pithumbsize: 500, inprop: 'url',
    });
    // eslint-disable-next-line no-await-in-loop
    const data = await get(url, { ttl: TTL.summary, signal });
    for (const p of data.query?.pages || []) {
      if (p.missing) continue;
      out.set(p.title, {
        title: p.title,
        description: p.description || '',
        extract: p.extract || '',
        thumb: p.thumbnail ? { src: cleanUrl(p.thumbnail.source) } : null,
        url: p.fullurl || '',
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- articles */

/**
 * The full article: parsed HTML, its section list and revision metadata.
 * One Action API call carries the table of contents and the body together.
 */
export async function article(lang, title, { signal } = {}) {
  if (!title) return null;
  const url = actionUrl(lang, {
    action: 'parse', page: title, redirects: 1,
    prop: 'text|sections|displaytitle|revid|langlinks|images',
    disableeditsection: 1, disabletoc: 1, mobileformat: 0,
  });
  const data = await get(url, { ttl: TTL.article, signal });
  const parse = data.parse;
  if (!parse) throw new ApiError('not-found', { status: 404 });
  // With formatversion=2 `parse.text` is a plain string; older shapes nest it
  // under "*". Accept either so the body never silently comes back empty.
  const html = typeof parse.text === 'string' ? parse.text : (parse.text?.['*'] || '');
  return {
    title: parse.title,
    displayTitle: parse.displaytitle || parse.title,
    pageId: parse.pageid,
    revid: parse.revid,
    html,
    sections: (parse.sections || []).map((s) => ({
      id: s.anchor, line: s.line, level: Number(s.level) || 2, index: s.index,
      number: s.number || '',
    })),
    langlinks: (parse.langlinks || []).map((l) => ({ lang: l.lang, title: l.title || l['*'] || '' })).filter((l) => l.title),
    images: parse.images || [],
  };
}

/** Plain-text extract of a whole article, for the answer builder. */
export async function extract(lang, title, { signal } = {}) {
  const url = actionUrl(lang, {
    action: 'query', titles: title, redirects: 1,
    prop: 'extracts', explaintext: 1, exchars: 6000,
  });
  const data = await get(url, { ttl: TTL.article, signal });
  const page = data.query?.pages?.[0];
  if (!page || page.missing) return '';
  return page.extract || '';
}

/**
 * Articles related to a title.
 *
 * The REST `/page/related/` endpoint is convenient but does not send CORS
 * headers, so a browser cannot read it. The Action API's `morelike:` search
 * keyword gives the same thing and is CORS-enabled, so that is what we use.
 */
export async function related(lang, title, { signal, limit = 8 } = {}) {
  try {
    const url = actionUrl(lang, {
      action: 'query', list: 'search', srsearch: `morelike:${title}`, srlimit: limit + 1,
      srprop: 'snippet', srnamespace: 0,
    });
    const data = await get(url, { ttl: TTL.summary, signal });
    const rows = (data.query?.search || []).filter((r) => r.title !== title).slice(0, limit);
    if (!rows.length) return [];
    const found = await summaries(lang, rows.map((r) => r.title), { signal });
    return rows.map((r) => found.get(r.title)).filter(Boolean);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ random */

export async function random(lang, { signal } = {}) {
  const url = actionUrl(lang, { action: 'query', list: 'random', rnnamespace: 0, rnlimit: 1 });
  const data = await get(url, { ttl: TTL.random, signal });
  return data.query?.random?.[0]?.title || '';
}

/* ------------------------------------------------------------------- feeds */

/** On this day: events, births, deaths, holidays for a month/day. */
export async function onThisDay(lang, month, day, { signal } = {}) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const types = ['selected', 'events', 'births', 'deaths', 'holidays'];
  const results = await Promise.allSettled(
    types.map((type) => get(restUrl(lang, `/feed/onthisday/${type}/${mm}/${dd}`), { ttl: TTL.feed, signal })),
  );
  const out = {};
  types.forEach((type, i) => {
    const r = results[i];
    out[type] = r.status === 'fulfilled' ? (r.value[type] || []) : [];
  });
  return out;
}

/** Featured content for a day (article, most-read list, image). */
export async function featured(lang, date = new Date(), { signal } = {}) {
  const y = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  try {
    const data = await get(restUrl(lang, `/feed/featured/${y}/${mm}/${dd}`), { ttl: TTL.feed, signal });
    const tfa = data.tfa || data.image || null;
    return {
      article: tfa ? normalisePage(tfa) : null,
      mostread: (data.mostread?.articles || []).map(normalisePage).filter(Boolean),
      image: data.image ? normalisePage(data.image) : null,
    };
  } catch {
    return { article: null, mostread: [], image: null };
  }
}

/**
 * Most-viewed articles for a day. The pageviews service lags by about a day,
 * so we walk back a few days until one answers.
 */
export async function mostRead(lang, { days = 4, signal } = {}) {
  for (let back = 1; back <= days; back++) {
    const d = new Date(Date.now() - back * 864e5);
    const y = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    try {
      const data = await get(
        `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${mm}/${dd}`,
        { ttl: TTL.pageviews, signal },
      );
      const items = data.items?.[0]?.articles || [];
      const rows = items
        .filter((a) => !/^(Special:|Main_Page|Wikipedia:|Portal:|File:|Help:)/.test(a.article))
        .map((a) => ({ title: a.article.replace(/_/g, ' '), views: a.views }))
        .slice(0, 10);
      if (rows.length) return rows;
    } catch { /* try the previous day */ }
  }
  return [];
}

/* ---------------------------------------------------------------- wikidata */

export async function wikidata(id, { signal } = {}) {
  if (!id) return null;
  const url = new URL(WIKIDATA_API);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', id);
  url.searchParams.set('props', 'labels|descriptions|claims|sitelinks');
  url.searchParams.set('languages', 'en|hi');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  const data = await get(url.toString(), { ttl: TTL.wikidata, signal });
  return data.entities?.[id] || null;
}

/* ----------------------------------------------------------------- commons */

/** Image credit + licence for a File: page on Commons. */
export async function imageInfo(fileTitle, { signal } = {}) {
  if (!fileTitle) return null;
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'extmetadata|url|size');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  const data = await get(url.toString(), { ttl: TTL.wikidata, signal });
  const info = data.query?.pages?.[0]?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata || {};
  const pick = (k) => (meta[k]?.value ? String(meta[k].value).replace(/<[^>]*>/g, '').trim() : '');
  return {
    url: info.url,
    width: info.width,
    height: info.height,
    artist: pick('Artist'),
    credit: pick('Credit'),
    licence: pick('LicenseShortName') || pick('License'),
    licenceUrl: pick('LicenseUrl'),
    description: pick('ImageDescription'),
  };
}

export { DEFAULT_LANG };
