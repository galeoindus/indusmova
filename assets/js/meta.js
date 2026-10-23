/* indusmova — page-level metadata.
 *
 * Kept apart from app.js so a view can describe its own page without importing
 * the entry point (which imports every view — a cycle). These are the three
 * things that decide what a crawler and a link preview see: the canonical URL,
 * the description, and the slug an article URL is built from.
 */

import { SITE } from './config.js';

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

/**
 * The canonical URL for a route. Articles get a real path — Cloudflare Pages
 * rewrites /articles/* to the app shell, so the address bar can hold a proper
 * shareable URL rather than a fragment.
 */
export function pathFor(route) {
  if (!route || route.name === 'home') return `${SITE.origin}/`;
  if (route.name === 'article' && route.params?.title) {
    const slug = slugify(route.params.title);
    const lang = route.query?.lang ? `?lang=${encodeURIComponent(route.query.lang)}` : '';
    // The trailing slash is the form Pages actually serves, for a static page
    // and for the rewrite alike, so the canonical matches the address bar.
    return `${SITE.origin}/articles/${slug}/${lang}`;
  }
  return `${SITE.origin}/#/${String(route.path || '').replace(/^\//, '')}`;
}

/** Describe the page from the article that actually loaded. */
export function describeArticle(text) {
  if (!text) return;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', String(text).replace(/\s+/g, ' ').trim().slice(0, 155));
}

/** Reset the description when a non-article page takes over. */
export function describeSite() {
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', SITE.description);
}
