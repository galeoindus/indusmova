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
  if (/<meta\s+name=["']indusmova-version["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta\s+name=["']indusmova-version["'][^>]*>/i, `<meta name="indusmova-version" content="${version}">`);
  } else if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (head) => `${head}\n  <meta name="indusmova-version" content="${version}">`);
  }
  if (/<meta\s+name=["']indusmova-build["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta\s+name=["']indusmova-build["'][^>]*>/i, `<meta name="indusmova-build" content="${build}">`);
  } else if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (head) => `${head}\n  <meta name="indusmova-build" content="${build}">`);
  }
  if (!/assets\/js\/build-watch\.js/.test(html) && /<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `  <script type="module" src="/assets/js/build-watch.js?v=${build}"></script>\n</body>`);
  }
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
