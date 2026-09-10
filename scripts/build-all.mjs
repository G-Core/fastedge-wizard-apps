/**
 * Builds every wizard under wizards/ in isolation, at any nesting depth (e.g.
 * a flat wizards/<name>/ or a customer-nested wizards/<customer>/<name>/).
 * Each wizard manages its own deps and package manager — this script detects
 * the lockfile and runs the appropriate install + build.
 * Skips directories starting with '_' (templates, utilities) or '.', and
 * node_modules.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const wizardsDir = join(root, 'wizards');
const CI = !!process.env.CI;

// A wizard is any directory (at any depth under wizards/) that has its own
// package.json — we stop descending there rather than treating an
// intermediate customer-folder as a wizard itself.
async function findWizards(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];

  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;

    const relPath = base ? `${base}/${e.name}` : e.name;
    const absPath = join(dir, e.name);

    if (existsSync(join(absPath, 'package.json'))) {
      found.push(relPath);
    } else {
      found.push(...await findWizards(absPath, relPath));
    }
  }

  return found;
}

const wizards = await findWizards(wizardsDir);

if (wizards.length === 0) {
  console.error('build-all: no wizards found in wizards/');
  process.exit(1);
}

for (const name of wizards) {
  const dir = join(wizardsDir, name);
  console.log(`\n▶ wizards/${name}`);

  const installCmd =
    existsSync(join(dir, 'pnpm-lock.yaml'))    ? `pnpm install${CI ? ' --frozen-lockfile' : ''}` :
    existsSync(join(dir, 'yarn.lock'))          ? `yarn install${CI ? ' --frozen-lockfile' : ''}` :
    existsSync(join(dir, 'bun.lockb'))          ? `bun install${CI ? ' --frozen-lockfile' : ''}` :
    existsSync(join(dir, 'package-lock.json'))  ? (CI ? 'npm ci' : 'npm install') :
                                                  'npm install';

  execSync(installCmd, { cwd: dir, stdio: 'inherit' });
  execSync('npm run build --silent', { cwd: dir, stdio: 'inherit' });
}

console.log(`\n✓ Built ${wizards.length} wizard(s)`);
