import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// HARD RULE: every deployed wizard must have passing snapshot + a11y coverage.
// So we discover wizards the same way build-all/assemble do — all non-underscore
// dirs under wizards/ — a blacklist, not a whitelist: a NEW wizard is covered by
// default. To exclude one, add its name to E2E_SKIP with a comment saying why.
const E2E_SKIP = new Set<string>([]);
const wizardsDir = join(__dirname, '..', 'wizards');
const WIZARDS = readdirSync(wizardsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((name) => !E2E_SKIP.has(name));

// Per-wizard bridge stubs — only what a wizard needs to reach a rendered
// screenshot. Wizards not listed fall back to the generic empty/minimal defaults.
type BridgeOverrides = {
    context?: Record<string, unknown>;
    templatesById?: Record<string, unknown>;
};
const OVERRIDES: Record<string, BridgeOverrides> = {
    // edge-totp reads launchTemplateId + companionTemplateIds from context.get,
    // resolves each via templates.read, and matches by api_type (never hard-coded
    // id). Give it one proxy-wasm filter + one wasi-http app so it renders.
    'edge-totp': {
        context: {
            launchTemplateId: 735,
            companionTemplateIds: [734],
            theme: 'light',
            locale: 'en',
            feAppId: null,
            managedAppIds: [],
            featureFlags: {},
        },
        templatesById: {
            735: { id: 735, api_type: 'proxy-wasm', name: 'TOTP - MFA Enforcement Filter', params: [] },
            734: { id: 734, api_type: 'wasi-http', name: 'TOTP - Challenge-Verify App', params: [] },
        },
    },
    // edge-sso ships one auth-app + one cdn-filter pair, shared across all
    // three variants — SSO_VARIANT (set by StepVariant) selects gate-only/
    // cookie/header behavior at runtime. The wizard classifies each by
    // api_type (never hard-coded id), same pattern as edge-totp above.
    'edge-sso': {
        context: {
            launchTemplateId: 191,
            companionTemplateIds: [194],
            theme: 'light',
            locale: 'en',
            feAppId: null,
            managedAppIds: [],
            featureFlags: {},
        },
        templatesById: {
            191: { id: 191, api_type: 'wasi-http', name: 'SSO - Auth App', params: [] },
            194: { id: 194, api_type: 'proxy-wasm', name: 'SSO - CDN Filter', params: [] },
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
    for (const theme of ['light', 'dark'] as const) {
        test(`${wizard} renders in gc-theme-${theme}`, async ({ page }) => {
            await page.goto(wizardUrl(wizard));
            await connectBridge(page, theme, OVERRIDES[wizard] ?? {});
            await expect(page).toHaveScreenshot(`${wizard}-gc-theme-${theme}.png`, { maxDiffPixelRatio: 0.05 });
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
