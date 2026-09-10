/**
 * Copies each wizards/<name>/dist/ (or nested wizards/<customer>/<name>/dist/)
 * and packages/<name>/dist/ into release/, preserving any nesting under
 * wizards/ — a customer-folder wizard lands at release/<customer>/<name>/, so
 * two customers can each name a wizard the same thing without colliding.
 * Run via: node scripts/assemble.mjs  (or pnpm run assemble from repo root)
 * Skips directories starting with '_' (templates, utilities) or '.', and
 * node_modules.
 */
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// A package is any directory (at any depth under sourceDir) that has its own
// package.json — we stop descending there rather than treating an
// intermediate customer-folder as a package itself.
async function findPackages(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];

  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;

    const relPath = base ? `${base}/${e.name}` : e.name;
    const absPath = join(dir, e.name);

    if (existsSync(join(absPath, 'package.json'))) {
      found.push(relPath);
    } else {
      found.push(...await findPackages(absPath, relPath));
    }
  }

  return found;
}

async function assembleDirs(sourceDir, label) {
  if (!existsSync(sourceDir)) return 0;
  const names = (await findPackages(sourceDir)).filter(name => existsSync(join(sourceDir, name, 'dist')));

  for (const name of names) {
    const src  = join(sourceDir, name, 'dist');
    const dest = join(root, 'release', name);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log(`  ${label}/${name}/dist  →  release/${name}/`);
  }
  return names.length;
}

const nWizards  = await assembleDirs(join(root, 'wizards'),  'wizards');
const nPackages = await assembleDirs(join(root, 'packages'), 'packages');
const total = nWizards + nPackages;

if (total === 0) {
  console.error('assemble: no dist/ directories found — run the build first');
  process.exit(1);
}

console.log(`\nassembled ${total} dir(s) into release/ (${nWizards} wizard(s), ${nPackages} package(s))`);
