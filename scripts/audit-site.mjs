#!/usr/bin/env node
/* Repository-wide checks for HTML asset references, build IDs, worker syntax and secrets. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const VERSION = String(pkg.version || '');
const errors = [];
const ignored = new Set(['.git', 'node_modules', '.wrangler', 'dist', 'build', '.gradle']);

async function walk(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(item.name)) continue;
    const file = join(dir, item.name);
    if (item.isDirectory()) found.push(...await walk(file));
    else if (item.isFile()) found.push(file);
  }
  return found;
}

const files = await walk(ROOT);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const jsFiles = files.filter((file) => file.endsWith('.js') && !file.endsWith('.min.js'));

for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { cwd: ROOT, stdio: 'pipe' });
  } catch (error) {
    errors.push(`JavaScript syntax: ${relative(ROOT, file)} — ${error.stderr?.toString().split('\n').slice(0, 3).join(' ')}`);
  }
}

const configPath = join(ROOT, 'assets/js/config.js');
const config = await readFile(configPath, 'utf8');
const configuredVersion = (config.match(/\bversion:\s*'([^']+)'/) || [])[1];
if (configuredVersion !== VERSION) errors.push(`Version drift: package.json=${VERSION}, assets/js/config.js=${configuredVersion || 'missing'}`);

const buildPattern = new RegExp(`^${VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-[a-f0-9]{7})?$`, 'i');
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const label = relative(ROOT, file);
  const mainOpen = (html.match(/<main\b/gi) || []).length;
  const mainClose = (html.match(/<\/main\s*>/gi) || []).length;
  if (mainOpen !== mainClose) errors.push(`Unbalanced <main> tags in ${label}: ${mainOpen} open / ${mainClose} close`);
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((item) => item[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) errors.push(`Duplicate HTML id(s) in ${label}: ${[...new Set(duplicateIds)].slice(0, 5).join(', ')}`);
  const build = (html.match(/<meta\s+name=["']indusmova-build["']\s+content=["']([^"']+)/i) || [])[1];
  if (!build) errors.push(`Missing indusmova-build meta: ${label} (run npm run stamp:build)`);
  else if (!buildPattern.test(build)) errors.push(`Wrong build id in ${label}: ${build} (package ${VERSION})`);
  if (!/assets\/js\/build-watch\.js/.test(html)) errors.push(`Missing live build watcher: ${label}`);
  if (/assets\/js\/article-points\.js/.test(html) && !files.some((item) => item === join(ROOT, 'assets/js/article-points.js'))) errors.push(`Article enhancement script is missing: ${label}`);
  for (const inline of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = inline[1] || '';
    if (/\bsrc\s*=/.test(attrs) || /type\s*=\"application\/ld\+json\"/i.test(attrs)) continue;
    if (inline[2].trim()) errors.push(`Inline executable script is blocked by the site's CSP: ${label}`);
  }

  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const value = match[1];
    if (!value.startsWith('/assets/')) continue;
    let url;
    try { url = new URL(value, 'https://local.invalid'); } catch { continue; }
    const assetPath = resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
    if (!assetPath.startsWith(ROOT + sep) && assetPath !== ROOT) continue;
    try { await stat(assetPath); }
    catch { errors.push(`Missing local asset: ${label} -> ${url.pathname}`); }
    const assetVersion = url.searchParams.get('v');
    if (assetVersion && !buildPattern.test(assetVersion)) {
      errors.push(`Stale asset version in ${label}: ${url.pathname}?v=${assetVersion}`);
    }
  }
}

const envExample = await readFile(join(ROOT, '.env.example'), 'utf8').catch(() => '');
for (const file of files.filter((item) => /(^|[\\/])\.env(?:\.|$)/.test(item) && !item.endsWith('.env.example'))) {
  errors.push(`Local environment secret file must not be tracked: ${relative(ROOT, file)}`);
}
for (let i = 1; i <= 6; i += 1) {
  if (!new RegExp(`^OPENROUTER_API_KEY_${i}=`, 'm').test(envExample)) errors.push(`.env.example missing OPENROUTER_API_KEY_${i}`);
}
for (const file of files.filter((item) => /\.(?:js|mjs|html|json|toml|ya?ml)$/.test(item))) {
  const source = await readFile(file, 'utf8').catch(() => '');
  if (/sk-or-v1-[A-Za-z0-9_-]{20,}/.test(source) || /AIza[0-9A-Za-z_-]{20,}/.test(source) || /(?:OPENROUTER_API_KEY(?:_[1-6])?)\s*=\s*['"][^'"]{12,}['"]/.test(source)) {
    errors.push(`Possible API credential literal: ${relative(ROOT, file)}`);
  }
}

if (errors.length) {
  process.stderr.write(`site audit: ${errors.length} issue(s)\n${errors.map((item) => ` - ${item}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`site audit: ${jsFiles.length} JavaScript files parsed, ${htmlFiles.length} HTML pages checked, local asset paths/build IDs consistent.\n`);
