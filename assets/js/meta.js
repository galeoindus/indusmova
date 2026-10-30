/* indusmova — page-level metadata.
 *
 * Kept apart from app.js so a view can describe its own page without importing
 * the entry point (which imports every view — a cycle).
 *
 * One function, `updateRouteMetadata`, owns everything a crawler or a link
 * preview reads: title, description, canonical, Open Graph, Twitter card,
 * structured data and the document language. The audit found that only the
 * title and canonical were being updated and the rest stayed on the homepage
 * values (F-05), and that canonicals were being written as fragment URLs
 * (F-02). Both are handled here.
 */

import { SITE } from './config.js';

const RTL_LANGS = new Set(['ur', 'ar', 'fa', 'he', 'sd', 'ks', 'dv', 'yi']);

/** The path a reader should be sent to for this route, or null for app state. */
export function pathFor(route) {
  if (!route || route.name === 'home') return `${SITE.origin}/`;
  if (route.name === 'article' && route.params?.title) {
    return `${SITE.origin}/articles/${slugify(route.params.title)}/`;
  }
  return null;
}

/**
 * A stable slug for an article title.
 *
 * Spaces become underscores and nothing else changes, so the slug is
 * lossless: "Chandrayaan-3" and "Indian independence movement" round-trip
 * exactly, the same way Wikipedia's own /wiki/ paths do.
 */
export function slugify(title) {
  return String(title || '').trim().replace(/\s+/g, '_');
}

/** The reverse, so a pasted /articles/<slug> finds the same article. */
export function unslug(slug) {
  return String(slug || '').replace(/_/g, ' ').trim();
}

function setMeta(selector, attr, value) {
  const node = document.querySelector(selector);
  if (node && value != null) node.setAttribute(attr, value);
}

function titleFor(route) {
  if (route.name === 'article' && route.params?.title) return `${unslug(route.params.title)} — ${SITE.name}`;
  if ((route.name === 'ask' || route.name === 'search') && route.query?.q) return `${route.query.q} — ${SITE.name}`;
  if (route.name === 'home') return SITE.title;
  const label = route.name.charAt(0).toUpperCase() + route.name.slice(1);
  return `${label} — ${SITE.name}`;
}

/**
 * Set every piece of page metadata from the route, and from the content once it
 * has loaded. `content` may carry `{ description, title, type, image }`.
 *
 * The canonical is a clean path where the page has one, and the app document
 * root otherwise — never a fragment URL, which Google does not accept as a
 * canonical (F-02).
 */
export function updateRouteMetadata(route, content = {}) {
  const title = content.title || titleFor(route);
  const description = (content.description || SITE.description).replace(/\s+/g, ' ').trim().slice(0, 158);
  const canonical = pathFor(route) || `${SITE.origin}/`;
  const type = content.type || (route.name === 'article' ? 'article' : 'website');

  document.title = title;
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:url"]', 'content', canonical);
  setMeta('meta[property="og:type"]', 'content', type);
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', description);
  setMeta('meta[name="twitter:url"]', 'content', canonical);
  if (content.image) {
    setMeta('meta[property="og:image"]', 'content', content.image);
    setMeta('meta[name="twitter:image"]', 'content', content.image);
  }

  const link = document.querySelector('link[rel="canonical"]');
  if (link) link.setAttribute('href', canonical);
}

/**
 * The document language, and the direction of a content region.
 *
 * The audit found the root `lang` stayed English however the interface or the
 * content changed (F-08), which makes a screen reader read Hindi with English
 * pronunciation rules.
 */
export function setDocumentLang(code) {
  if (code) document.documentElement.setAttribute('lang', code);
}

/** Mark a content region with its own language and direction. */
export function markContentLang(node, code) {
  if (!node || !code) return;
  node.setAttribute('lang', code);
  node.setAttribute('dir', RTL_LANGS.has(String(code).slice(0, 2)) ? 'rtl' : 'ltr');
}

export function isRtl(code) {
  return RTL_LANGS.has(String(code || '').slice(0, 2));
}

/** Article structured data, using only facts that are on the page. */
export function setArticleStructuredData(record) {
  const id = 'indusmova-article-ld';
  document.getElementById(id)?.remove();
  if (!record) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = id;
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: record.headline,
    description: record.description || undefined,
    url: record.url,
    inLanguage: record.lang || 'en',
    isBasedOn: record.isBasedOn || undefined,
    dateModified: record.dateModified || undefined,
    license: record.license || 'https://creativecommons.org/licenses/by-sa/4.0/',
    publisher: { '@type': 'Organization', name: SITE.name, url: `${SITE.origin}/` },
    isAccessibleForFree: true,
  });
  document.head.append(script);
}
