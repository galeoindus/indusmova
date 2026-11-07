#!/usr/bin/env node
/* Stamp every HTML entry point with the same build id and cache-bust URL. */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid package version: ${version}`);
let commit = String(process.env.BUILD_COMMIT || '').trim();
if (!commit) commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
commit = commit.slice(0, 7);
if (!/^[0-9a-f]{7}$/i.test(commit)) throw new Error('BUILD_COMMIT must be a 7-character git SHA');
const build = `${version}-${commit}`;
const excluded = new Set(['.git', 'node_modules', '.wrangler', 'dist', 'build']);

function metaAttribute(tag, attribute) {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : '';
}

/** Set a build meta tag whatever the attribute order, and collapse duplicates. */
function upsertMeta(html, name, content) {
  let found = false;
  html = html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (metaAttribute(tag, 'name').toLowerCase() !== name.toLowerCase()) return tag;
    if (found) return '';
    found = true;
    return `<meta name="${name}" content="${content}">`;
  });
  if (!found && /<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (head) => `${head}\n  <meta name="${name}" content="${content}">`);
  }
  return html;
}

async function walk(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) output.push(full);
  }
  return output;
}

let changed = 0;
for (const file of await walk(ROOT)) {
  let html = await readFile(file, 'utf8');
  const before = html;
  html = html.replace(/([?&]v=)[^&"'\s<>]+/g, `$1${build}`);
  // Move legacy article inline scripts into an external file permitted by script-src 'self'.
  html = html.replace(/<script>\s*\/\* Read the article the way the breakdown reads:[\s\S]*?<\/script>/gi, `<script type="module" src="/assets/js/article-points.js?v=${build}" defer></script>`);
  // The image failure handler has to be listening before the first <img> in
  // the body is requested, so it is installed here for every page — the static
  // article pages as well as the single-page app.
  if (!/assets\/js\/image-fallback\.js/.test(html) && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `  <script src="/assets/js/image-fallback.js?v=${build}"></script>\n</head>`);
  }
  html = upsertMeta(html, 'indusmova-version', version);
  html = upsertMeta(html, 'indusmova-build', build);
  // The shared design layer: type, spacing, controls, focus, print. Loaded
  // last so it settles every page onto the same system.
  if (!/assets\/css\/system\.css/.test(html) && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/assets/css/system.css?v=${build}">\n</head>`);
  }
  // The reading column and the phone sheet. Both load after everything else
  // because they are corrections to the layout rather than part of the paint,
  // and both are added here so a page created later gets them without anyone
  // having to remember.
  for (const sheet of ['article-layout.css', 'mobile.css', 'polish.css']) {
    if (new RegExp(`assets/css/${sheet.replace('.', '\\.')}`).test(html)) continue;
    if (!/<\/head>/i.test(html)) continue;
    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/assets/css/${sheet}?v=${build}">\n</head>`);
  }
  // The phone navigation belongs on every page: the article pages had no way
  // out of a 113,000 px document except the brand mark, because the header's
  // text links are hidden below 860 px.
  if (!/class="bottom-nav"/.test(html) && /<\/body>/i.test(html)) {
    const nav = `  <nav class="bottom-nav" aria-label="Primary (phone)">
    <a href="/#/ask"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/></svg><span>Ask</span></a>
    <a href="/#/explore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M15 9l-2 4-4 2 2-4z"/></svg><span>Explore</span></a>
    <a href="/topics/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg><span>Topics</span></a>
    <a href="/#/library"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h5v14H4zM11 5h5v14h-5zM18 6l3 12-3 1z"/></svg><span>Library</span></a>
    <a href="/#/bookmarks"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span>Saved</span></a>
  </nav>
</body>`;
    html = html.replace(/<\/body>/i, nav);
  }
  // A phone with a notch needs the safe-area insets the sheets rely on.
  if (/name=["']viewport["']/i.test(html) && !/viewport-fit=cover/i.test(html)) {
    html = html.replace(/(<meta\s+name=["']viewport["'][^>]*content=["'])([^"']*)(["'])/i, '$1$2, viewport-fit=cover$3');
  }
  if (!/assets\/js\/build-watch\.js/.test(html) && /<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `  <script type="module" src="/assets/js/build-watch.js?v=${build}"></script>\n</body>`);
  }
  // The floating "Ask AI" launcher belongs on every page except the chat
  // itself, which is already the destination.
  const isChat = /(^|\/)chat\/index\.html$/.test(file.replace(/\\/g, '/'));
  if (!isChat && !/assets\/js\/chat-launcher\.js/.test(html) && /<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `  <script src="/assets/js/chat-launcher.js?v=${build}" defer></script>\n</body>`);
  }
  // The standalone article pages get the Translate control from
  // article-points.js, the module they already load — a separate tag for it
  // was fetched but never evaluated, so the button never appeared.
  html = html.replace(/[ \t]*<script type="module" src="\/assets\/js\/article-translate-page\.js[^"]*"[^>]*><\/script>\r?\n?/gi, '');
  html = html.replace(/indusmova v\d+\.\d+\.\d+/gi, `indusmova v${version}`);
  // The footer prints the version inside a span, so "indusmova v5.0.0" alone
  // never matched it and the no-JS footer drifted a release behind.
  html = html.replace(/(id=["']appVersion["'][^>]*>v)\d+\.\d+\.\d+/gi, `$1${version}`);
  if (html !== before) {
    await writeFile(file, html);
    changed += 1;
  }
}

const configPath = join(ROOT, 'assets/js/config.js');
let config = await readFile(configPath, 'utf8');
config = config.replace(/(\bversion:\s*')[^']+(')/, `$1${version}$2`);
await writeFile(configPath, config);

await writeFile(join(ROOT, 'assets/version.json'), `${JSON.stringify({ version, commit, built: new Date().toISOString() }, null, 2)}\n`);
process.stdout.write(`Build ${build}: stamped ${changed} HTML files, config.js and assets/version.json.\n`);

// ── sitemap ────────────────────────────────────────────────────────────────
// Built from the pages that exist in this deployment, so it can never list a
// URL that 404s or miss a page that was added. `priority` and `changefreq`
// are omitted: Google has said it ignores both.
const ORIGIN = 'https://indusmova.pages.dev';
const pages = (await walk(ROOT))
  .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
  .filter((rel) => !rel.startsWith('404') && rel.endsWith('.html'))
  .map((rel) => (rel === 'index.html' ? '/' : `/${rel.replace(/index\.html$/, '')}`))
  .filter((path, i, all) => all.indexOf(path) === i)
  .sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
const today = new Date().toISOString().slice(0, 10);
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map((p) => `  <url>\n    <loc>${ORIGIN}${p}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`),
  '</urlset>',
  '',
].join('\n');
await writeFile(join(ROOT, 'sitemap.xml'), xml);
process.stdout.write(`Sitemap: ${pages.length} URLs written.\n`);
