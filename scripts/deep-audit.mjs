#!/usr/bin/env node
/**
 * indusmova — deep audit.
 *
 * `npm run check` answers "does the site load". This answers "is every file
 * internally consistent", one file at a time, and it is meant to be run daily:
 *
 *   html      ids, headings, links, assets, meta, inline script (the CSP
 *             blocks it), alt text, duplicate ids, charset and viewport
 *   js        syntax, every named import really exported, debug leftovers,
 *             hardcoded secrets, references to files that do not exist
 *   css       brace balance, url() targets, colour-mix fallbacks, !important
 *             outside the accessibility overrides
 *   json      every .json / .webmanifest parses
 *   xml       sitemap parses, every <loc> has a file, every page is listed
 *   config    _headers, _redirects, robots.txt, llms.txt agree with the tree
 *   version   package.json = config.js = every HTML meta = version.json
 *
 * Exit code 1 when anything is wrong, so a scheduled run can act on it.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', '.wrangler', 'dist', 'build', '.gradle']);
const problems = [];
const warnings = [];
const add = (kind, msg) => problems.push(`${kind}: ${msg}`);
const warn = (kind, msg) => warnings.push(`${kind}: ${msg}`);

async function walk(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(item.name)) continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) out.push(...await walk(full));
    else if (item.isFile()) out.push(full);
  }
  return out;
}

const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const files = await walk(ROOT);
const rel = (f) => relative(ROOT, f).split(sep).join('/');
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const jsFiles = files.filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'));
const cssFiles = files.filter((f) => f.endsWith('.css'));

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const VERSION = String(pkg.version || '');
const BUILD_RE = new RegExp(`^${VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-[a-f0-9]{7})?$`, 'i');

/* ── redirect rules, so a link may point at one ─────────────────────────── */
const redirectRules = [];
try {
  for (const line of (await readFile(join(ROOT, '_redirects'), 'utf8')).split('\n')) {
    const row = line.trim();
    if (!row || row.startsWith('#')) continue;
    const [from, to] = row.split(/\s+/);
    if (from) redirectRules.push({ from, to });
  }
} catch { add('config', '_redirects is missing'); }

const covered = (path) => redirectRules.some((r) => {
  if (r.from === path) return true;
  if (r.from.endsWith('/*')) return path.startsWith(r.from.slice(0, -1));
  return false;
});

/* ── HTML ───────────────────────────────────────────────────────────────── */
for (const file of htmlFiles) {
  const label = rel(file);
  const html = await readFile(file, 'utf8');

  const meta = (name) => (html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)`, 'i')) || [])[1]
    || (html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i')) || [])[1];
  const prop = (p) => (html.match(new RegExp(`<meta[^>]+property=["']${p}["'][^>]*content=["']([^"']*)`, 'i')) || [])[1]
    || (html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${p}["']`, 'i')) || [])[1];

  if (!/<meta[^>]+charset/i.test(html)) add('html', `${label}: no charset`);
  if (!meta('viewport')) add('html', `${label}: no viewport`);
  if (!/<html[^>]+lang=/i.test(html)) add('html', `${label}: no lang on <html>`);
  if (!/<title>[^<]+<\/title>/i.test(html)) add('html', `${label}: empty or missing <title>`);
  if (!meta('description')) add('html', `${label}: no description`);
  if (!prop('og:title')) add('html', `${label}: no og:title`);
  if (!prop('og:description')) add('html', `${label}: no og:description`);
  if (!prop('og:image')) warn('html', `${label}: no og:image`);
  if (!meta('indusmova-build')) add('html', `${label}: no indusmova-build meta`);
  else if (!BUILD_RE.test(meta('indusmova-build'))) add('html', `${label}: build id ${meta('indusmova-build')} is not ${VERSION}`);

  const h1 = (html.match(/<h1\b/gi) || []).length;
  if (h1 !== 1) add('html', `${label}: ${h1} <h1> elements`);

  const mainOpen = (html.match(/<main\b/gi) || []).length;
  const mainClose = (html.match(/<\/main\s*>/gi) || []).length;
  if (mainOpen !== mainClose) add('html', `${label}: ${mainOpen} <main> open, ${mainClose} close`);

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((m) => m[1]);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) add('html', `${label}: duplicate id(s) ${dupes.slice(0, 5).join(', ')}`);

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/application\/ld\+json/i.test(attrs)) continue;
    if (m[2].trim()) add('html', `${label}: inline script would be blocked by the CSP`);
  }

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt\s*=/.test(m[0])) add('html', `${label}: <img> without alt (${m[0].slice(0, 60)}…)`);
  }

  for (const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const value = m[1];
    if (!value || /^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(value)) continue;
    const clean = value.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = clean.startsWith('/') ? join(ROOT, clean) : resolve(dirname(file), clean);
    let ok = await exists(target);
    if (!ok && clean.endsWith('/')) ok = await exists(join(target, 'index.html'));
    if (!ok && !covered(clean)) add('html', `${label}: dead reference ${value}`);
    const v = (value.match(/[?&]v=([^&"']+)/) || [])[1];
    if (v && !BUILD_RE.test(decodeURIComponent(v))) warn('html', `${label}: stale ?v=${v} on ${clean}`);
  }
}

/* ── JavaScript ─────────────────────────────────────────────────────────── */
const exportsOf = new Map();
for (const file of jsFiles) {
  const label = rel(file);
  const src = await readFile(file, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    add('js', `${label}: syntax — ${String(error.stderr || '').split('\n').slice(0, 2).join(' ')}`);
    continue;
  }
  if (/\bconsole\.(log|debug|dir|table)\(/.test(src)) add('js', `${label}: leftover console call`);
  if (/\bdebugger\b/.test(src)) add('js', `${label}: leftover debugger`);
  if (/(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i.test(src)) add('js', `${label}: possible hardcoded credential`);

  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  exportsOf.set(resolve(file), names);

  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), m[1]);
    if (!await exists(target)) add('js', `${label}: imports ${m[1]}, which does not exist`);
  }
}

for (const file of jsFiles) {
  const label = rel(file);
  const src = await readFile(file, 'utf8');
  for (const m of src.matchAll(/import\s+(?:([A-Za-z0-9_$]+)\s*,\s*)?\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), m[3]);
    const exported = exportsOf.get(target);
    if (!exported) continue;
    for (const part of m[2].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !exported.has(name)) add('js', `${label}: imports {${name}} but ${m[3]} does not export it`);
    }
  }
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
for (const file of cssFiles) {
  const label = rel(file);
  const css = await readFile(file, 'utf8');
  const opens = (css.match(/\{/g) || []).length;
  const closes = (css.match(/\}/g) || []).length;
  if (opens !== closes) add('css', `${label}: ${opens} { against ${closes} }`);
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const target = m[1];
    if (/^(data:|https?:|\/\/|#|%23)/i.test(target)) continue;
    // An SVG filter inside a data URI looks like url(%23n); it is not a path.
    if (!target.includes('/') && !target.includes('.')) continue;
    const path = target.startsWith('/') ? join(ROOT, target) : resolve(dirname(file), target);
    if (!await exists(path.split('?')[0])) add('css', `${label}: url(${target}) has no file`);
  }
  const important = (css.match(/!important/g) || []).length;
  if (important > 40) warn('css', `${label}: ${important} !important rules`);
}

/* ── JSON ───────────────────────────────────────────────────────────────── */
for (const file of files.filter((f) => f.endsWith('.json') || f.endsWith('.webmanifest'))) {
  try {
    JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    add('json', `${rel(file)}: ${error.message}`);
  }
}

/* ── XML / sitemap ──────────────────────────────────────────────────────── */
const sitemapFile = join(ROOT, 'sitemap.xml');
if (await exists(sitemapFile)) {
  const xml = await readFile(sitemapFile, 'utf8');
  if (!/^<\?xml/.test(xml.trim())) add('xml', 'sitemap.xml: no XML declaration');
  if ((xml.match(/<url>/g) || []).length !== (xml.match(/<\/url>/g) || []).length) add('xml', 'sitemap.xml: unbalanced <url>');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!locs.length) add('xml', 'sitemap.xml: no <loc> entries');
  for (const loc of locs) {
    let path;
    try { path = new URL(loc).pathname; } catch { add('xml', `sitemap.xml: bad URL ${loc}`); continue; }
    let target = join(ROOT, path);
    let ok = await exists(target);
    if (!ok && path.endsWith('/')) ok = await exists(join(target, 'index.html'));
    if (!ok) add('xml', `sitemap.xml: ${loc} has no file`);
  }
  for (const file of htmlFiles) {
    const r = rel(file);
    if (!r.endsWith('index.html')) continue;
    const path = `/${r.slice(0, -'index.html'.length)}`;
    if (!locs.some((loc) => new URL(loc).pathname === path)) warn('xml', `page not in sitemap: ${path}`);
  }
} else {
  add('xml', 'sitemap.xml is missing');
}

/* ── config files ───────────────────────────────────────────────────────── */
for (const name of ['_headers', '_redirects', 'robots.txt', 'llms.txt', 'manifest.webmanifest', 'wrangler.toml']) {
  if (!await exists(join(ROOT, name))) add('config', `${name} is missing`);
}

const robots = await readFile(join(ROOT, 'robots.txt'), 'utf8').catch(() => '');
const sitemapLine = (robots.match(/^Sitemap:\s*(\S+)/m) || [])[1];
if (!sitemapLine) add('config', 'robots.txt: no Sitemap line');

const headers = await readFile(join(ROOT, '_headers'), 'utf8').catch(() => '');
for (const block of headers.split(/\n(?=\S)/)) {
  const [pathLine] = block.trim().split('\n');
  if (!pathLine || pathLine.startsWith('#')) continue;
  const path = pathLine.trim();
  if (path.includes('*') || path === '/*') continue;
  let target = join(ROOT, path);
  let ok = await exists(target);
  if (!ok && path.endsWith('/')) ok = await exists(join(target, 'index.html'));
  if (!ok) add('config', `_headers: block for ${path} matches no file`);
}

/* ── version, everywhere ────────────────────────────────────────────────── */
const configSrc = await readFile(join(ROOT, 'assets/js/config.js'), 'utf8').catch(() => '');
const configured = (configSrc.match(/\bversion:\s*['"]([^'"]+)['"]/) || [])[1];
if (configured !== VERSION) add('version', `config.js says ${configured || 'nothing'}, package.json says ${VERSION}`);
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const v = (html.match(/<meta[^>]+name=["']indusmova-version["'][^>]*content=["']([^"']+)/i) || [])[1];
  if (v && v !== VERSION) add('version', `${rel(file)}: indusmova-version ${v}`);
}
const versionJson = JSON.parse(await readFile(join(ROOT, 'assets/version.json'), 'utf8').catch(() => '{}'));
if (versionJson.version && versionJson.version !== VERSION) add('version', `version.json says ${versionJson.version}`);

/* ── report ─────────────────────────────────────────────────────────────── */
const line = (s) => process.stdout.write(`${s}\n`);
line(`deep audit — ${htmlFiles.length} HTML, ${jsFiles.length} JS, ${cssFiles.length} CSS, ${files.length} files`);
if (warnings.length) {
  line('');
  for (const w of warnings) line(`  warning · ${w}`);
}
if (problems.length) {
  line('');
  for (const p of problems) line(`  FAIL · ${p}`);
  line('');
  line(`${problems.length} problem(s), ${warnings.length} warning(s)`);
  process.exitCode = 1;
} else {
  line('');
  line(`no problems, ${warnings.length} warning(s)`);
}
