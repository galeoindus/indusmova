#!/usr/bin/env node
/* indusmova — bump the release version.
 *
 * The footer showed v5.19.0 for weeks while a dozen features shipped, because
 * the version in package.json was only ever edited by hand and nobody did.
 * A release is now a command: it bumps the version, stamps every page and
 * asset URL with it, and prints the one line to put in the commit message.
 *
 *   npm run release           # 5.20.0 -> 5.20.1
 *   npm run release minor     # 5.20.0 -> 5.21.0
 *   npm run release major     # 5.20.0 -> 6.0.0
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const pkgPath = join(ROOT, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));

const current = String(pkg.version || '').trim();
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!match) throw new Error(`package.json version is not semver: ${current}`);

const kind = (process.argv[2] || 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(kind)) {
  throw new Error(`unknown release kind "${kind}" — use patch, minor or major`);
}

let [major, minor, patch] = match.slice(1).map(Number);
if (kind === 'major') { major += 1; minor = 0; patch = 0; }
else if (kind === 'minor') { minor += 1; patch = 0; }
else { patch += 1; }

const next = `${major}.${minor}.${patch}`;
pkg.version = next;
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

// Propagate the new version into config.js, every page and version.json.
execFileSync('node', [join(ROOT, 'scripts/stamp-build.mjs')], { cwd: ROOT, stdio: 'inherit' });

process.stdout.write(`\nReleased ${current} -> ${next}. Suggested commit message:\n  release: v${next}\n`);
