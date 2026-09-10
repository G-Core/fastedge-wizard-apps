#!/usr/bin/env node
/**
 * Fails if any var(--gc-*) used in wizard or package CSS references a token
 * not defined in the live wizard.css served by fastedge-frontend.
 *
 * Fetches the canonical source at runtime — no local copy, no drift.
 * Unknown tokens → silent rendering failures → must fail CI.
 */
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIZARD_CSS_URL = 'https://wizard-app-4732724.fastedge.cdn.gc.onl/styles/v1/wizard.css';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';

const res = await fetch(WIZARD_CSS_URL);
if (!res.ok) throw new Error(`Failed to fetch wizard.css: ${res.status} ${WIZARD_CSS_URL}`);
const tokensCss = await res.text();
const defined = new Set(
    [...tokensCss.matchAll(/(--gc-[\w-]+)\s*:/g)].map(m => m[1])
);
console.log(`check-tokens: loaded ${defined.size} tokens from wizard.css`);

const patterns = ['wizards/**/src/**/*.css', 'packages/*/src/**/*.css'];
const files = [];
for (const pattern of patterns) {
    for await (const f of glob(pattern, { cwd: root })) files.push(join(root, f));
}

let bad = 0;
for (const file of files) {
    const css = readFileSync(file, 'utf8');
    for (const [, token] of css.matchAll(/var\((--gc-[\w-]+)\)/g)) {
        if (!defined.has(token)) {
            const rel = file.replace(root + '/', '');
            console.error(`unknown token ${token} in ${rel}`);
            bad++;
        }
    }
}

if (bad) {
    console.error(`\n${bad} unknown --gc-* token(s). Fix the name or add the token to wizard.css.`);
    process.exit(1);
}
console.log(`check-tokens: ${files.length} file(s) clean`);
