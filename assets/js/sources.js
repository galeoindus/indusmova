/* indusmova — the open-source registry.
 *
 * Every source here is free, public and needs no API key. They are called
 * straight from the browser, so each one has to send CORS headers; the ones
 * that do not (arXiv, Google Books) are deliberately absent.
 *
 *   Wikimedia family   Wikipedia, Wikiquote, Wikisource, Wikinews, Wikibooks,
 *                      Wikiversity, Wikivoyage, Wiktionary, Wikidata, Commons
 *   Books              Project Gutenberg (Gutendex), Open Library, Internet Archive
 *   Research           Crossref, OpenAlex, Europe PMC, PubMed, DOAJ
 *
 * Each source exposes:
 *   search(query, {limit, lang, signal}) -> [item]
 *   get(id, {lang, signal})              -> item | null
 *
 * and every item is normalised to the same shape, so one set of views can
 * render a Wikipedia article, a Gutenberg book and a Crossref paper alike:
 *
 *   { source, sourceName, kind, id, title, extract, url, thumb, meta[], licence }
 */

import { stripTags, cleanUrl } from './ui.js';

const TIMEOUT = 9000;

async function getJson(url, { signal, as = 'json' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: as === 'json' ? 'application/json' : 'application/xml, text/xml' },
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return as === 'json' ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------- Wikimedia family */

const WIKI_PROJECTS = [
  { id: 'wikipedia', name: 'Wikipedia', host: 'wikipedia.org', kind: 'Encyclopaedia', licence: 'CC BY-SA 4.0' },
  { id: 'wikiquote', name: 'Wikiquote', host: 'wikiquote.org', kind: 'Quotations', licence: 'CC BY-SA 4.0' },
  { id: 'wikisource', name: 'Wikisource', host: 'wikisource.org', kind: 'Books & texts', licence: 'CC BY-SA 4.0' },
  { id: 'wikinews', name: 'Wikinews', host: 'wikinews.org', kind: 'News', licence: 'CC BY 2.5' },
  { id: 'wikibooks', name: 'Wikibooks', host: 'wikibooks.org', kind: 'Books', licence: 'CC BY-SA 4.0' },
  { id: 'wikiversity', name: 'Wikiversity', host: 'wikiversity.org', kind: 'Courses', licence: 'CC BY-SA 4.0' },
  { id: 'wikivoyage', name: 'Wikivoyage', host: 'wikivoyage.org', kind: 'Travel', licence: 'CC BY-SA 4.0' },
  { id: 'wiktionary', name: 'Wiktionary', host: 'wiktionary.org', kind: 'Dictionary', licence: 'CC BY-SA 4.0' },
];

async function wikiSearch(project, query, { limit = 6, lang = 'en', signal } = {}) {
  const url = new URL(`https://${lang}.${project.host}/w/api.php`);
  const params = {
    action: 'query', generator: 'search', gsrsearch: query, gsrlimit: String(limit),
    gsrnamespace: '0', prop: 'pageimages|description|extracts', exintro: '1', explaintext: '1',
    exchars: '280', piprop: 'thumbnail', pithumbsize: '400',
    format: 'json', formatversion: '2', origin: '*',
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const data = await getJson(url.toString(), { signal });
  return (data.query?.pages || []).map((p) => ({
    source: project.id,
    sourceName: project.name,
    kind: project.kind,
    licence: project.licence,
    id: p.title,
    title: p.title,
    extract: p.extract || p.description || '',
    thumb: p.thumbnail?.source ? cleanUrl(p.thumbnail.source) : '',
    url: `https://${lang}.${project.host}/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
    inApp: { route: 'article', title: p.title, project: project.id },
  }));
}

async function wikiGet(project, id, { lang = 'en', signal } = {}) {
  const url = new URL(`https://${lang}.${project.host}/w/api.php`);
  const params = {
    action: 'query', titles: id, prop: 'pageimages|description|extracts',
    exintro: '1', explaintext: '1', exchars: '900', piprop: 'thumbnail', pithumbsize: '400',
    format: 'json', formatversion: '2', origin: '*',
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const data = await getJson(url.toString(), { signal });
  const p = data.query?.pages?.[0];
  if (!p || p.missing) return null;
  return {
    source: project.id, sourceName: project.name, kind: project.kind, licence: project.licence,
    id: p.title, title: p.title, extract: p.extract || p.description || '',
    thumb: p.thumbnail?.source ? cleanUrl(p.thumbnail.source) : '',
    url: `https://${lang}.${project.host}/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
    inApp: { route: 'article', title: p.title, project: project.id },
  };
}

/* --------------------------------------------------------------- books */

const gutenberg = {
  id: 'gutenberg', name: 'Project Gutenberg', kind: 'Books', licence: 'Public domain',
  home: 'https://www.gutenberg.org/',
  async search(query, { limit = 6, signal } = {}) {
    const data = await getJson(`https://gutendex.com/books?search=${encodeURIComponent(query)}`, { signal });
    return (data.results || []).slice(0, limit).map(bookItem);
  },
  async get(id, { signal } = {}) {
    try {
      const book = await getJson(`https://gutendex.com/books/${encodeURIComponent(id)}`, { signal });
      return bookItem(book);
    } catch { return null; }
  },
};

function bookItem(b) {
  const authors = (b.authors || []).map((a) => a.name).join(', ');
  return {
    source: 'gutenberg', sourceName: 'Project Gutenberg', kind: 'Book', licence: 'Public domain',
    id: String(b.id), title: b.title || 'Untitled',
    extract: (b.summaries || [])[0] || (b.subjects || []).slice(0, 3).join(' · ') || '',
    thumb: b.formats?.['image/jpeg'] || '',
    url: `https://www.gutenberg.org/ebooks/${b.id}`,
    meta: [
      authors ? { label: 'Author', value: authors } : null,
      b.authors?.[0]?.birth_year ? { label: 'Born', value: String(b.authors[0].birth_year) } : null,
      { label: 'Downloads', value: String(b.download_count ?? 0) },
      b.languages?.length ? { label: 'Language', value: b.languages.join(', ') } : null,
    ].filter(Boolean),
    readUrl: (b.formats?.['text/html'] || b.formats?.['text/plain; charset=us-ascii'] || ''),
  };
}

const openlibrary = {
  id: 'openlibrary', name: 'Open Library', kind: 'Books', licence: 'Metadata: CC0',
  home: 'https://openlibrary.org/',
  async search(query, { limit = 6, signal } = {}) {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`
      + '&fields=key,title,author_name,first_publish_year,subject,cover_i,language,number_of_pages_median,ia';
    const data = await getJson(url, { signal });
    return (data.docs || []).map(olItem);
  },
  async get(id, { signal } = {}) {
    try {
      const key = id.startsWith('/') ? id : `/works/${id}`;
      const data = await getJson(`https://openlibrary.org${key}.json`, { signal });
      return olItem({ key, title: data.title, author_name: (data.authors || []).map((a) => a.name), first_publish_year: data.first_publish_date });
    } catch { return null; }
  },
};

function olItem(d) {
  const cover = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '';
  const authors = (d.author_name || []).join(', ');
  return {
    source: 'openlibrary', sourceName: 'Open Library', kind: 'Book', licence: 'Metadata: CC0',
    id: d.key || d.title, title: d.title || 'Untitled',
    extract: (d.subject || []).slice(0, 5).join(' · '),
    thumb: cover,
    url: d.key ? `https://openlibrary.org${d.key}` : `https://openlibrary.org/search?q=${encodeURIComponent(d.title || '')}`,
    meta: [
      authors ? { label: 'Author', value: authors } : null,
      d.first_publish_year ? { label: 'First published', value: String(d.first_publish_year) } : null,
      d.number_of_pages_median ? { label: 'Pages', value: String(d.number_of_pages_median) } : null,
      d.language?.length ? { label: 'Language', value: d.language.slice(0, 3).join(', ') } : null,
    ].filter(Boolean),
  };
}

const internetarchive = {
  id: 'archive', name: 'Internet Archive', kind: 'Archive', licence: 'Per item',
  home: 'https://archive.org/',
  async search(query, { limit = 6, signal } = {}) {
    const url = 'https://archive.org/advancedsearch.php?'
      + `q=${encodeURIComponent(`${query} AND mediatype:(texts)`)}`
      + '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=description'
      + `&rows=${limit}&page=1&output=json`;
    const data = await getJson(url, { signal });
    return (data.response?.docs || []).map((d) => ({
      source: 'archive', sourceName: 'Internet Archive', kind: 'Archive item', licence: 'Per item',
      id: d.identifier, title: d.title || d.identifier,
      extract: stripTags(String(d.description || '')).slice(0, 260),
      thumb: `https://archive.org/services/img/${d.identifier}`,
      url: `https://archive.org/details/${d.identifier}`,
      meta: [
        d.creator ? { label: 'Creator', value: [].concat(d.creator).join(', ') } : null,
        d.year ? { label: 'Year', value: String(d.year) } : null,
      ].filter(Boolean),
    }));
  },
  async get(id, { signal } = {}) {
    try {
      const data = await getJson(`https://archive.org/metadata/${encodeURIComponent(id)}`, { signal });
      const m = data.metadata || {};
      // Archive answers 200 with an empty object for an identifier it does not
      // hold; that is a miss, not a record.
      if (!Object.keys(m).length) return null;
      return {
        source: 'archive', sourceName: 'Internet Archive', kind: 'Archive item', licence: 'Per item',
        id, title: m.title || id, extract: stripTags(String(m.description || '')).slice(0, 600),
        thumb: `https://archive.org/services/img/${id}`, url: `https://archive.org/details/${id}`,
        meta: [
          m.creator ? { label: 'Creator', value: [].concat(m.creator).join(', ') } : null,
          m.date ? { label: 'Date', value: String(m.date) } : null,
          m.licenseurl ? { label: 'Licence', value: String(m.licenseurl) } : null,
        ].filter(Boolean),
      };
    } catch { return null; }
  },
};

/* ------------------------------------------------------------- research */

const crossref = {
  id: 'crossref', name: 'Crossref', kind: 'Research papers', licence: 'Metadata: open',
  home: 'https://www.crossref.org/',
  async search(query, { limit = 6, signal } = {}) {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`
      + '&select=DOI,title,author,abstract,container-title,issued,URL,type&mailto=bholasee8816@gmail.com';
    const data = await getJson(url, { signal });
    return (data.message?.items || []).map(crItem);
  },
  async get(id, { signal } = {}) {
    try {
      const data = await getJson(`https://api.crossref.org/works/${encodeURIComponent(id)}?mailto=bholasee8816@gmail.com`, { signal });
      return crItem(data.message);
    } catch { return null; }
  },
};

function crItem(w) {
  const authors = (w.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);
  const year = w.issued?.['date-parts']?.[0]?.[0];
  return {
    source: 'crossref', sourceName: 'Crossref', kind: w.type === 'journal-article' ? 'Journal article' : (w.type || 'Work'),
    licence: 'Metadata: open',
    id: w.DOI, title: (w.title || [])[0] || 'Untitled',
    extract: stripTags(String(w.abstract || '')).slice(0, 700),
    url: w.URL || `https://doi.org/${w.DOI}`,
    meta: [
      authors.length ? { label: 'Authors', value: authors.slice(0, 4).join(', ') } : null,
      year ? { label: 'Year', value: String(year) } : null,
      w['container-title']?.[0] ? { label: 'Published in', value: w['container-title'][0] } : null,
      w.DOI ? { label: 'DOI', value: w.DOI } : null,
    ].filter(Boolean),
  };
}

const openalex = {
  id: 'openalex', name: 'OpenAlex', kind: 'Research papers', licence: 'CC0 1.0',
  home: 'https://openalex.org/',
  async search(query, { limit = 6, signal } = {}) {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}`
      + '&select=id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,type,cited_by_count'
      + '&mailto=bholasee8816@gmail.com';
    const data = await getJson(url, { signal });
    return (data.results || []).map(oaItem);
  },
  async get(id, { signal } = {}) {
    try {
      const clean = id.replace('https://openalex.org/', '');
      const data = await getJson(`https://api.openalex.org/works/${encodeURIComponent(clean)}?mailto=bholasee8816@gmail.com`, { signal });
      return oaItem(data);
    } catch { return null; }
  },
};

/** OpenAlex gives abstracts as an inverted index; turn it back into text. */
function invertAbstract(index) {
  if (!index) return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  return words.filter(Boolean).join(' ').slice(0, 700);
}

function oaItem(w) {
  const authors = (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean);
  const venue = w.primary_location?.source?.display_name || '';
  return {
    source: 'openalex', sourceName: 'OpenAlex', kind: w.type === 'article' ? 'Journal article' : (w.type || 'Work'),
    licence: 'CC0 1.0',
    id: w.id, title: w.title || 'Untitled',
    extract: invertAbstract(w.abstract_inverted_index),
    url: w.doi || w.id,
    meta: [
      authors.length ? { label: 'Authors', value: authors.slice(0, 4).join(', ') } : null,
      w.publication_year ? { label: 'Year', value: String(w.publication_year) } : null,
      venue ? { label: 'Published in', value: venue } : null,
      w.cited_by_count != null ? { label: 'Cited by', value: String(w.cited_by_count) } : null,
    ].filter(Boolean),
  };
}

const europepmc = {
  id: 'europepmc', name: 'Europe PMC', kind: 'Life sciences', licence: 'Open access',
  home: 'https://europepmc.org/',
  async search(query, { limit = 6, signal } = {}) {
    const url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?'
      + `query=${encodeURIComponent(query)}&format=json&pageSize=${limit}&resultType=core`;
    const data = await getJson(url, { signal });
    return (data.resultList?.result || []).map(epmcItem);
  },
  async get(id, { signal } = {}) {
    try {
      const url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?'
        + `query=${encodeURIComponent(`EXT_ID:${id}`)}&format=json&pageSize=1&resultType=core`;
      const data = await getJson(url, { signal });
      const r = data.resultList?.result?.[0];
      return r ? epmcItem(r) : null;
    } catch { return null; }
  },
};

function epmcItem(r) {
  return {
    source: 'europepmc', sourceName: 'Europe PMC', kind: r.pubType || 'Article', licence: 'Open access',
    id: r.id || r.doi, title: r.title || 'Untitled',
    extract: stripTags(String(r.abstractText || '')).slice(0, 700),
    url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`,
    meta: [
      r.authorString ? { label: 'Authors', value: r.authorString.split(',').slice(0, 4).join(', ') } : null,
      r.pubYear ? { label: 'Year', value: String(r.pubYear) } : null,
      r.journalTitle ? { label: 'Journal', value: r.journalTitle } : null,
      r.doi ? { label: 'DOI', value: r.doi } : null,
    ].filter(Boolean),
  };
}

const pubmed = {
  id: 'pubmed', name: 'PubMed', kind: 'Medicine', licence: 'Metadata: open',
  home: 'https://pubmed.ncbi.nlm.nih.gov/',
  async search(query, { limit = 6, signal } = {}) {
    const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
    const found = await getJson(`${base}esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&term=${encodeURIComponent(query)}`, { signal });
    const ids = found.esearchresult?.idlist || [];
    if (!ids.length) return [];
    const sum = await getJson(`${base}esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`, { signal });
    const result = sum.result || {};
    return ids.map((id) => result[id]).filter(Boolean).map((r) => ({
      source: 'pubmed', sourceName: 'PubMed', kind: 'Article', licence: 'Metadata: open',
      id: r.uid, title: stripTags(r.title || 'Untitled'),
      extract: '',
      url: `https://pubmed.ncbi.nlm.nih.gov/${r.uid}/`,
      meta: [
        r.authors?.length ? { label: 'Authors', value: r.authors.slice(0, 4).map((a) => a.name).join(', ') } : null,
        r.pubdate ? { label: 'Published', value: r.pubdate } : null,
        r.fulljournalname ? { label: 'Journal', value: r.fulljournalname } : null,
      ].filter(Boolean),
    }));
  },
};

const doaj = {
  id: 'doaj', name: 'DOAJ', kind: 'Open-access journals', licence: 'Open access',
  home: 'https://doaj.org/',
  async search(query, { limit = 6, signal } = {}) {
    const data = await getJson(`https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${limit}`, { signal });
    return (data.results || []).map(doajItem);
  },
  async get(id, { signal } = {}) {
    try {
      const data = await getJson(`https://doaj.org/api/articles/${encodeURIComponent(id)}`, { signal });
      return data.bibjson ? doajItem({ id, bibjson: data.bibjson }) : null;
    } catch { return null; }
  },
};

function doajItem(r) {
  const b = r.bibjson || {};
  return {
    source: 'doaj', sourceName: 'DOAJ', kind: 'Open-access article', licence: b.journal?.license?.[0]?.type || 'Open access',
    id: r.id, title: b.title || 'Untitled',
    extract: stripTags(String(b.abstract || '')).slice(0, 700),
    url: (b.link || []).find((l) => l.type === 'fulltext')?.url || `https://doaj.org/article/${r.id}`,
    meta: [
      b.author?.length ? { label: 'Authors', value: b.author.slice(0, 4).map((a) => a.name).join(', ') } : null,
      b.year ? { label: 'Year', value: String(b.year) } : null,
      b.journal?.title ? { label: 'Journal', value: b.journal.title } : null,
    ].filter(Boolean),
  };
}

/* ---------------------------------------------------------------- registry */

export const SOURCE_LIST = [
  ...WIKI_PROJECTS.map((p) => ({ ...p, family: 'wikimedia', search: (q, o) => wikiSearch(p, q, o), get: (id, o) => wikiGet(p, id, o), home: `https://en.${p.host}/` })),
  { ...gutenberg, family: 'books' },
  { ...openlibrary, family: 'books' },
  { ...internetarchive, family: 'archive' },
  { ...crossref, family: 'research' },
  { ...openalex, family: 'research' },
  { ...europepmc, family: 'research' },
  { ...pubmed, family: 'research' },
  { ...doaj, family: 'research' },
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCE_LIST.map((s) => [s.id, s]));

/** The Wikimedia family, for the language-aware search. */
export const WIKI_PROJECT_IDS = WIKI_PROJECTS.map((p) => p.id);

/**
 * Search every source at once. A source that is unreachable or rate-limited is
 * reported as failed rather than breaking the whole page.
 */
export async function searchAll(query, { limit = 5, lang = 'en', signal, only = null, skip = [] } = {}) {
  const sources = SOURCE_LIST.filter((s) => (!only || only.includes(s.id)) && !skip.includes(s.id));
  const results = await Promise.allSettled(
    sources.map((s) => s.search(query, { limit, lang, signal })),
  );
  return sources.map((s, i) => ({
    source: s.id,
    name: s.name,
    kind: s.kind,
    licence: s.licence,
    family: s.family,
    home: s.home,
    ok: results[i].status === 'fulfilled',
    error: results[i].status === 'rejected' ? String(results[i].reason?.message || results[i].reason) : '',
    items: results[i].status === 'fulfilled' ? results[i].value : [],
  }));
}

/** Fetch one record by id from a named source. */
export async function getRecord(sourceId, id, { lang = 'en', signal } = {}) {
  const source = SOURCE_BY_ID[sourceId];
  if (!source || !source.get) return null;
  try {
    return await source.get(id, { lang, signal });
  } catch {
    return null;
  }
}

export { WIKI_PROJECTS };
