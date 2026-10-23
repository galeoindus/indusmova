#!/usr/bin/env node
/* Every file, not just the entry point.
 *
 * The audit (F-11) found the check script ran `node --check` on app.js alone.
 * This parses every module, and verifies that each named import is actually
 * exported by the module it comes from — the class of mistake that reaches the
 * browser as "does not provide an export named…" and blanks the page.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const problems = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, 'assets/js'));
files.push(join(ROOT, 'sw.js'));

// 1. syntax
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`syntax: ${relative(ROOT, file)}\n${err.stderr?.toString().split('\n').slice(0, 4).join('\n')}`);
  }
}

// 2. every named import resolves to a real export
const exportsOf = new Map();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      if (part.trim()) names.add(part.trim().split(' as ').pop().trim());
    }
  }
  exportsOf.set(normalize(file), names);
}

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = m[2];
    if (!target.startsWith('.')) continue;
    const resolved = normalize(join(dirname(file), target));
    const available = exportsOf.get(resolved);
    if (!available) { problems.push(`missing module: ${relative(ROOT, file)} -> ${target}`); continue; }
    for (const name of m[1].split(',').map((n) => n.trim().split(' as ')[0].trim()).filter(Boolean)) {
      if (!available.has(name)) problems.push(`bad import: ${relative(ROOT, file)} imports '${name}' from ${target}, which does not export it`);
    }
  }
}

// 3. no obvious debris
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  if (/console\.(log|debug)\(/.test(src)) problems.push(`leftover debug: ${relative(ROOT, file)}`);
  if (/\bdebugger\b/.test(src)) problems.push(`leftover debugger: ${relative(ROOT, file)}`);
}

if (problems.length) {
  console.error(`check: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`check: ${files.length} modules parsed, every import resolves, no leftover debug.`);
