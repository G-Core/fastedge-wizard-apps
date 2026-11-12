/**
 * Pins the @gcoredev/fastedge-wizard-sdk dependency to a specific published npm
 * version across the *real* wizards (non-underscore dirs). Underscore templates
 * and examples (_template, _example…) intentionally track "latest" and are never
 * touched. Verifies the version is published on npm before writing.
 *
 *   node scripts/bump-sdk.mjs <version> [--dry-run] [--no-verify]
 *
 *   <version>     published SDK version, e.g. 1.2.3 (leading v optional)
 *   --dry-run     print changes, write nothing
 *   --no-verify   skip the npm existence check
 *   --selftest    run the transform's assertions and exit
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = '@gcoredev/fastedge-wizard-sdk';
const DEP_RE = /("@gcoredev\/fastedge-wizard-sdk":\s*)"[^"]*"/;

const root = fileURLToPath(new URL('..', import.meta.url));

/** Pin the SDK dep to an exact version in a package.json's raw text. Null if absent. */
function pinText(text, version) {
  if (!DEP_RE.test(text)) return null;
  return text.replace(DEP_RE, `$1"${version}"`);
}

function selfTest() {
  const latest = '{\n    "@gcoredev/fastedge-wizard-sdk": "latest"\n}';
  const pinned = '{\n    "@gcoredev/fastedge-wizard-sdk": "1.0.0"\n}';
  console.assert(pinText(latest, '1.2.3').includes('"1.2.3"'), 'latest not pinned');
  console.assert(pinText(pinned, '1.2.3').includes('"1.2.3"'), 'old pin not replaced');
  console.assert(pinText('{"react":"19"}', '1.2.3') === null, 'missing dep not null');
  console.log('selftest ok');
}

const args = process.argv.slice(2);
if (args.includes('--selftest')) { selfTest(); process.exit(0); }

const flags = new Set(args.filter((a) => a.startsWith('--')));
const raw = args.find((a) => !a.startsWith('--'));
if (!raw) {
  console.error('usage: node scripts/bump-sdk.mjs <version> [--dry-run] [--no-verify]');
  process.exit(1);
}
const version = raw.replace(/^v/, '');

// Verify the version is actually published before touching anything.
if (!flags.has('--no-verify')) {
  let found = '';
  try {
    found = execSync(`npm view ${PKG}@${version} version`, { encoding: 'utf8' }).trim();
  } catch {
    /* npm exits non-zero when the version doesn't exist */
  }
  if (found !== version) {
    console.error(`✗ ${PKG}@${version} is not published on npm.`);
    process.exit(1);
  }
}

// Real wizards only — underscore templates/examples stay on "latest". A wizard is any directory (at any
// depth, e.g. wizards/gcore/edge-totp) with its own package.json, as build-all.mjs discovers them.
function findWizards(dir) {
  const found = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;
    const pkg = join(dir, e.name, 'package.json');
    found.push(...(existsSync(pkg) ? [pkg] : findWizards(join(dir, e.name))));
  }
  return found;
}
const targets = findWizards(join(root, 'wizards'));

const dry = flags.has('--dry-run');
let changed = 0;
for (const file of targets) {
  if (!existsSync(file)) continue;
  const before = readFileSync(file, 'utf8');
  const after = pinText(before, version);
  const rel = file.slice(root.length);
  if (after === null) { console.log(`  skip  ${rel} (no ${PKG})`); continue; }
  if (after === before) { console.log(`  ok    ${rel} (already ${version})`); continue; }
  if (!dry) writeFileSync(file, after);
  console.log(`  ${dry ? 'would' : 'pin  '} ${rel} → ${version}`);
  changed++;
}

console.log(`\n${dry ? '[dry-run] ' : ''}${changed} file(s) ${dry ? 'would change' : 'changed'}`);
if (changed && !dry) console.log('→ run `pnpm install` in each pinned wizard to refresh lockfiles');
