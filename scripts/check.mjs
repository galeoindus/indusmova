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

// 3. every cross-module name used in a file is actually imported there.
//    The old check only proved imports resolved; it could not see a name that
//    was used but never imported. That mistake throws at runtime and can
//    silently truncate a whole view — it did exactly that to the Ask page.
//
//    Strings and comments are removed by a small scanner rather than by
//    regular expressions, because a regex cannot tell code from the word
//    "article (" inside a sentence of interface copy.
function codeOnly(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/') {
      // A slash is a regex literal, not a division or a comment, when the last
      // meaningful character before it could not end an expression.
      const before = out.replace(/\s+$/, '').slice(-1);
      const word = (out.replace(/\s+$/, '').match(/([A-Za-z_$][A-Za-z0-9_$]*)$/) || [])[1] || '';
      const regexAllowed = !before || '([{,;:=!&|?+-*%~^<>'.includes(before)
        || ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else'].includes(word);
      if (regexAllowed) {
        i++;
        let inClass = false;
        while (i < n) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          else if (src[i] === '\n') break;
          i++;
        }
        while (i < n && /[a-z]/.test(src[i])) i++;
        out += ' /regex/ ';
        continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          // Keep the inside of an interpolation: it is code.
          i += 2; let depth = 1; let inner = '';
          while (i < n && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (!depth) { i++; break; } }
            inner += src[i]; i++;
          }
          out += ` ${codeOnly(inner)} `;
          continue;
        }
        i++;
      }
      out += ' ';
      continue;
    }
    out += c; i++;
  }
  return out;
}

const allExports = new Set();
for (const names of exportsOf.values()) for (const n of names) allExports.add(n);

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const imported = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const n of m[1].split(',').map((x) => x.trim().split(' as ').pop().trim()).filter(Boolean)) imported.add(n);
  }
  for (const m of src.matchAll(/import\s+([A-Za-z0-9_$]+)\s+from/g)) imported.add(m[1]);

  const code = codeOnly(src);
  const defined = new Set();
  for (const m of code.matchAll(/(?:function|class)\s+([A-Za-z0-9_$]+)/g)) defined.add(m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) defined.add(m[1]);

  for (const name of allExports) {
    if (imported.has(name) || defined.has(name)) continue;
    // A method definition (async search(query) { … }) defines the name too.
    if (new RegExp(`(?<![.\\w$])${name}\\s*\\([^)]*\\)\\s*\\{`).test(code)) continue;
    // Only a bare call counts; api.article(…) and ctx.isBookmarked(…) are fine.
    if (new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(code)) {
      problems.push(`missing import: ${relative(ROOT, file)} calls ${name}() but never imports it`);
    }
  }
}

// 4. no obvious debris
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  if (/console\.(log|debug)\(/.test(src)) problems.push(`leftover debug: ${relative(ROOT, file)}`);
  if (/\bdebugger\b/.test(src)) problems.push(`leftover debugger: ${relative(ROOT, file)}`);
}


// 5. one version everywhere (the audit's F-01: this drifted before)
{
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const swVersion = (sw.match(/const VERSION = 'indusmova-v([0-9.]+)'/) || [])[1];
  if (!swVersion) problems.push('version: sw.js has no VERSION constant');
  else if (swVersion !== version) problems.push(`version: sw.js says ${swVersion}, package.json says ${version}`);

  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const queries = [...html.matchAll(/\?v=([0-9.]+)/g)].map((m) => m[1]);
  const stale = [...new Set(queries)].filter((q) => q !== version);
  if (stale.length) problems.push(`version: index.html asks for ?v=${stale.join(', ?v=')}, package.json says ${version}`);

  const shown = (html.match(/id="appVersion">v([0-9.]+)</) || [])[1];
  if (shown && shown !== version) problems.push(`version: the footer says v${shown}, package.json says ${version}`);
}

if (problems.length) {
  console.error(`check: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`check: ${files.length} modules parsed, every import resolves, no leftover debug, one version everywhere.`);
