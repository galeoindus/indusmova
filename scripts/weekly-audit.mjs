#!/usr/bin/env node
/* Weekly repository audit, run by .github/workflows/scheduled-health.yml.
 *
 * Push-time CI answers "does this commit still work?". This script answers the
 * slower question "has the site drifted?" — a page nobody links to any more, an
 * article that never reached the sitemap, an internal link that resolves to a
 * file that was renamed months ago. None of those break a push, so nothing
 * catches them today.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['.git', 'node_modules', '.wrangler', 'dist', 'build', '.gradle']);
const problems = [];
const notes = [];

function walk(dir, out = []) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(item.name)) continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) walk(full, out);
    else if (item.isFile()) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const rel = (f) => f.slice(ROOT.length + 1);

/* 1. Every article directory must ship an index.html. */
const articleDirs = readdirSync(join(ROOT, 'articles'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
for (const dir of articleDirs) {
  if (!existsSync(join(ROOT, 'articles', dir, 'index.html'))) {
    problems.push(`articles/${dir}/ has no index.html`);
  }
}
notes.push(`${articleDirs.length} article directories, ${htmlFiles.length} HTML files`);

/* 2. The sitemap must list every page, and nothing that no longer exists. */
const sitemapPath = join(ROOT, 'sitemap.xml');
if (!existsSync(sitemapPath)) {
  problems.push('sitemap.xml is missing');
} else {
  const sitemap = readFileSync(sitemapPath, 'utf8');
  const locs = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) problems.push('sitemap.xml lists no URLs');

  const localPaths = new Set();
  for (const loc of locs) {
    let path;
    try {
      path = new URL(loc).pathname;
    } catch {
      problems.push(`sitemap entry is not an absolute URL: ${loc}`);
      continue;
    }
    localPaths.add(path);
    const target = path.endsWith('/') ? join(ROOT, path, 'index.html') : join(ROOT, path);
    if (!existsSync(target)) problems.push(`sitemap lists a page that does not exist: ${loc}`);
  }

  for (const dir of articleDirs) {
    if (!localPaths.has(`/articles/${dir}/`) && !localPaths.has(`/articles/${dir}`)) {
      problems.push(`article missing from sitemap.xml: /articles/${dir}/`);
    }
  }
  notes.push(`${locs.length} URLs in sitemap.xml`);
}

/* 3. Internal links and asset references must resolve on disk. */
const skipScheme = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = m[1].trim();
    if (!raw || skipScheme.test(raw)) continue;
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;
    const base = clean.startsWith('/') ? join(ROOT, clean) : join(dirname(file), clean);
    const candidates = [base, join(base, 'index.html')];
    if (!candidates.some((c) => existsSync(c) && statSync(c).isFile())) {
      problems.push(`${rel(file)} → ${raw} does not resolve`);
    }
  }
}

/* 4. Nothing that looks like a committed secret. */
const secretPatterns = [
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bsk-[A-Za-z0-9]{32,}\b/, 'OpenAI-style secret key'],
];
for (const file of files) {
  if (/\.(png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf|zip|gz)$/i.test(file)) continue;
  if (/package-lock\.json$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [pattern, label] of secretPatterns) {
    if (pattern.test(text)) problems.push(`${rel(file)} looks like it contains a ${label}`);
  }
}

console.log(notes.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
console.log('weekly audit: clean');
