import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// HARD RULE: every deployed wizard must have passing snapshot + a11y coverage.
// So we discover wizards the same way build-all/assemble do — any dir at any
// depth under wizards/ with its own package.json (so a flat wizards/<name>/
// and a nested wizards/<customer>/<name>/ are both covered) — a blacklist,
// not a whitelist: a NEW wizard is covered by default. To exclude one, add
// its name to E2E_SKIP with a comment saying why.
const E2E_SKIP = new Set<string>([]);
const wizardsDir = join(__dirname, '..', 'wizards');

function findWizards(dir: string, base = ''): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const found: string[] = [];

    for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;

        const relPath = base ? `${base}/${e.name}` : e.name;
        const absPath = join(dir, e.name);

        if (existsSync(join(absPath, 'package.json'))) {
            found.push(relPath);
        } else {
            found.push(...findWizards(absPath, relPath));
        }
    }

    return found;
}

const WIZARDS = findWizards(wizardsDir).filter((name) => !E2E_SKIP.has(name));

// Per-wizard bridge stubs — only what a wizard needs to reach a rendered
// screenshot. Wizards not listed fall back to the generic empty/minimal defaults.
type BridgeOverrides = {
    context?: Record<string, unknown>;
    templatesById?: Record<string, unknown>;
    /** `deployment.current` result — Re-entry wizards load their form from it. */
    current?: Record<string, unknown>;
};
const OVERRIDES: Record<string, BridgeOverrides> = {
    // edge-totp reads launchTemplateId + companionTemplateIds from context.get,
    // resolves each via templates.read, and matches by api_type (never hard-coded
    // id). Give it one proxy-wasm filter + one wasi-http app so it renders.
    'gcore/edge-totp': {
        context: {
            launchTemplateId: 1,
            companionTemplateIds: [2],
            theme: 'light',
            locale: 'en',
            feAppId: null,
            managedAppIds: [],
            featureFlags: {},
        },
        templatesById: {
            1: { id: 1, api_type: 'proxy-wasm', name: 'TOTP - MFA Enforcement Filter', params: [] },
            2: { id: 2, api_type: 'wasi-http', name: 'TOTP - Challenge-Verify App', params: [] },
        },
    },
    // edge-sso ships one auth-app + one cdn-filter pair, shared across all
    // three variants — SSO_VARIANT (set by StepVariant) selects gate-only/
    // cookie/header behavior at runtime. The wizard classifies each by
    // api_type (never hard-coded id), same pattern as edge-totp above.
    'gcore/edge-sso': {
        context: {
            launchTemplateId: 1,
            companionTemplateIds: [2],
            theme: 'light',
            locale: 'en',
            feAppId: null,
            managedAppIds: [],
            featureFlags: {},
        },
        templatesById: {
            1: { id: 1, api_type: 'wasi-http', name: 'SSO - Auth App', params: [] },
            2: { id: 2, api_type: 'proxy-wasm', name: 'SSO - CDN Filter', params: [] },
        },
    },
    // config-builder-example: one wasi-http app launched from its template; starts from an empty tree.
    'gcore/config-builder-example': {
        context: {
            launchTemplateId: 1,
            companionTemplateIds: [],
            theme: 'light',
            locale: 'en',
            feAppId: null,
            managedAppIds: [],
            featureFlags: {},
        },
        templatesById: {
            1: { id: 1, api_type: 'wasi-http', name: 'Request router (echo)', params: [] },
        },
    },
    // html2md is single-app/zero-param — it only needs launchTemplateId to be non-null
    // to render past the "must be launched from..." bail state.
    'gcore/html2md': {
        context: {
            launchTemplateId: 1,
            companionTemplateIds: [],
            theme: 'light',
            locale: 'en',
            feAppId: null,
            managedAppIds: [],
            featureFlags: {},
        },
        templatesById: {
            1: { id: 1, api_type: 'proxy-wasm', name: 'Transform HTML to Markdown', params: [] },
        },
    },
};

// Re-entry: the wizard reopened on its deployed app (launchTemplateId null) loads its form from
// deployment.current(). One extra snapshot + a11y pass per wizard listed here.
const REENTRY: Record<string, BridgeOverrides> = {
    // The wizard's own re-entry fixture (also what its mock host loads with ?mode=reentry).
    'gcore/config-builder-example': {
        context: {
            launchTemplateId: null,
            companionTemplateIds: [],
            theme: 'light',
            locale: 'en',
            feAppId: 101,
            managedAppIds: [101],
            featureFlags: {},
        },
        current: JSON.parse(
            readFileSync(join(wizardsDir, 'gcore/config-builder-example/fixtures/deployment/current.json'), 'utf8'),
        ),
    },
    'gcore/edge-totp': {
        context: {
            launchTemplateId: null,
            companionTemplateIds: [],
            theme: 'light',
            locale: 'en',
            feAppId: 101,
            managedAppIds: [101, 102],
            featureFlags: {},
        },
        current: {
            revision: 'rev-1',
            cdnResourceId: 900,
            fastedgeApps: [
                {
                    ref: 'filter',
                    name: 'totp-filter',
                    api_type: 'proxy-wasm',
                    source: { fromTemplateId: 1 },
                    env: {
                        AUTH_PREFIX: '/auth/totp',
                        MFA_AUDIENCE: 'https://shop.example.com',
                        MFA_SESSION_COOKIE: 'mfa_session',
                    },
                    secretRefs: { MFA_SESSION_KEY: 11 },
                },
                {
                    ref: 'app',
                    name: 'totp-app',
                    api_type: 'wasi-http',
                    source: { fromTemplateId: 2 },
                    env: {
                        AUTH_PREFIX: '/auth/totp',
                        MFA_AUDIENCE: 'https://shop.example.com',
                        MFA_SESSION_COOKIE: 'mfa_session',
                        KV_STORE_ID: '7',
                    },
                    secretRefs: { MFA_SESSION_KEY: 11, HANDOFF_KEY: 12, ENROLL_API_KEY: 13, GCORE_API_TOKEN: 14 },
                    storeRefs: { TOTP_USER_SEEDS: 7 },
                },
            ],
            cdnOrigins: [{ ref: 'app-origin', name: 'totp-app-origin', appRef: 'app' }],
            cdnRules: [
                { ref: 'app-route', name: 'totp-auth-route', rule: '^/auth/totp', weight: 1, originGroupRef: 'app-origin' },
                {
                    ref: 'filter:/checkout',
                    name: 'totp-mfa-filter-1',
                    rule: '^/checkout',
                    weight: 10,
                    fastedgeFilter: { appRef: 'filter', hook: 'on_request_headers', interruptOnError: true },
                },
            ],
            secrets: [
                { id: 11, name: 'totp-mfa-session-key' },
                { id: 12, name: 'totp-handoff-key' },
                { id: 13, name: 'totp-enroll-api-key' },
                { id: 14, name: 'platform-api-token' },
            ],
            stores: [{ id: 7, name: 'totp-seeds' }],
        },
    },
};

// Package example pages — no SDK bridge, just theme the body class and screenshot.
const PACKAGE_EXAMPLES = ['wizard-step-kit'];

// SDK protocol version — must match the SDK constant.
const V = 1;
const PORT = 9000;

// Include hostOrigin so the SDK's origin check passes when we self-post INIT.
// When not in an iframe, window.parent === window, so the source check also passes.
function wizardUrl(wizard: string): string {
    return `http://localhost:${PORT}/${wizard}/index.html?hostOrigin=http://localhost:${PORT}`;
}

// Inject a minimal host bridge into the current page, triggering the SDK
// handshake and stubbing all intent responses with empty/minimal data.
// Sets document.body.dataset.ready = 'true' when READY is received.
async function connectBridge(page: Page, theme: 'light' | 'dark', overrides: BridgeOverrides = {}): Promise<void> {
    await page.evaluate(({ V, theme, overrides }) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e: MessageEvent) => {
            const m = e.data as Record<string, unknown>;
            if (!m || m['v'] !== V) return;
            if (m['type'] === 'ready') {
                document.body.dataset['ready'] = 'true';
            } else if (m['type'] === 'intent') {
                const intent = m['intent'] as string;
                const params = (m['params'] ?? {}) as Record<string, unknown>;
                let data: unknown;
                if (intent === 'context.get') {
                    data = overrides.context ?? {};
                } else if (intent === 'deployment.current') {
                    data = overrides.current ?? null;
                } else if (intent === 'fastedge.templates.read') {
                    data = overrides.templatesById?.[String(params['id'])] ?? null;
                } else if (intent.endsWith('.list')) {
                    data = [];
                } else if (intent.endsWith('.get')) {
                    data = null;
                } else {
                    data = {};
                }
                ch.port1.postMessage({ v: V, type: 'result', id: m['id'], ok: true, data });
            }
        };
        ch.port1.start();
        window.postMessage({ v: V, type: 'init' }, location.origin, [ch.port2]);
        ch.port1.postMessage({ v: V, type: 'hello', hostContext: { specVersion: '1', theme, locale: 'en' } });
    }, { V, theme, overrides });

    await page.waitForFunction(() => document.body.dataset['ready'] === 'true', { timeout: 10_000 });
    // Allow post-connect async intent round-trips to settle before screenshotting
    await page.waitForTimeout(500);
}

for (const name of PACKAGE_EXAMPLES) {
    for (const theme of ['light', 'dark'] as const) {
        test(`${name} example renders in gc-theme-${theme}`, async ({ page }) => {
            await page.goto(`http://localhost:${PORT}/${name}/index.html`);
            await page.evaluate((t) => {
                document.body.classList.remove('gc-theme-light', 'gc-theme-dark');
                document.body.classList.add(`gc-theme-${t}`);
            }, theme);
            // Wait for custom elements to upgrade
            await page.waitForFunction(() =>
                customElements.get('gc-wizard-shell') !== undefined &&
                customElements.get('gc-optional-panels') !== undefined
            );
            await expect(page).toHaveScreenshot(`${name}-gc-theme-${theme}.png`, { maxDiffPixelRatio: 0.05 });
        });
    }

    test(`${name} example — no critical a11y violations`, async ({ page }) => {
        await page.goto(`http://localhost:${PORT}/${name}/index.html`);
        await page.evaluate(() => document.body.classList.add('gc-theme-light'));
        await page.waitForFunction(() => customElements.get('gc-wizard-shell') !== undefined);
        const results = await new AxeBuilder({ page }).analyze();
        // ponytail: explicit cast because axe types only resolve after pnpm install
        expect(results.violations.filter((v: { impact: unknown }) => v.impact === 'critical')).toEqual([]);
    });
}

for (const wizard of WIZARDS) {
    // Flatten any customer-folder nesting (e.g. "gcore/edge-totp") into one
    // filename segment — snapshot storage stays flat regardless of source layout.
    const snapshotName = wizard.replace(/\//g, '-');

    for (const theme of ['light', 'dark'] as const) {
        test(`${wizard} renders in gc-theme-${theme}`, async ({ page }) => {
            await page.goto(wizardUrl(wizard));
            await connectBridge(page, theme, OVERRIDES[wizard] ?? {});
            await expect(page).toHaveScreenshot(`${snapshotName}-gc-theme-${theme}.png`, { maxDiffPixelRatio: 0.05 });
        });
    }

    test(`${wizard} — no critical a11y violations`, async ({ page }) => {
        await page.goto(wizardUrl(wizard));
        await connectBridge(page, 'light', OVERRIDES[wizard] ?? {});
        const results = await new AxeBuilder({ page }).analyze();
        // ponytail: explicit cast because axe types only resolve after pnpm install
        expect(results.violations.filter((v: { impact: unknown }) => v.impact === 'critical')).toEqual([]);
    });
}

for (const [wizard, overrides] of Object.entries(REENTRY)) {
    const snapshotName = `${wizard.replace(/\//g, '-')}-reentry`;

    for (const theme of ['light', 'dark'] as const) {
        test(`${wizard} (re-entry) renders in gc-theme-${theme}`, async ({ page }) => {
            await page.goto(wizardUrl(wizard));
            await connectBridge(page, theme, overrides);
            await expect(page).toHaveScreenshot(`${snapshotName}-gc-theme-${theme}.png`, { maxDiffPixelRatio: 0.05 });
        });
    }

    test(`${wizard} (re-entry) — no critical a11y violations`, async ({ page }) => {
        await page.goto(wizardUrl(wizard));
        await connectBridge(page, 'light', overrides);
        const results = await new AxeBuilder({ page }).analyze();
        // ponytail: explicit cast because axe types only resolve after pnpm install
        expect(results.violations.filter((v: { impact: unknown }) => v.impact === 'critical')).toEqual([]);
    });
}
