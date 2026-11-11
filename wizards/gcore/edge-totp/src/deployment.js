// Where every form field lives in the deployment, declared once (SDK field map). Both modes use it:
//   template mode — save the form into a fresh skeleton → newCdnOrigins/newCdnRules create plan
//   Re-entry      — load the form from deployment.current(), save back into it → desired-state plan
// Keys the map doesn't own (hand edits in the dashboard, WIZARD_* keys) pass through untouched.
import { defineFieldMap, field, fieldError } from '@gcoredev/fastedge-wizard-sdk';

const BOTH = ['filter', 'app'];
const FILTER_ALL = 'filter:*';
const FILTER_ALL_RULE = '^/.*'; // the CDN API rejects a rule of only slashes, so not '^/'

export const DEFAULT_BRAND_COLOR = '#0066cc';

// Escape a user-supplied path prefix for a CDN rule regex — otherwise metacharacters (the '.' in
// "/auth.v2") match more broadly than the literal path the user typed.
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const parseProtectedPaths = (raw) => [
    ...new Set(
        raw
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 1 && p.startsWith('/')),
    ),
];

const appOf = (state, ref) => state.fastedgeApps.find((a) => a.ref === ref);
const baseName = (state) => appOf(state, 'filter').name.replace(/-filter$/, '');
const filterBinding = { appRef: 'filter', hook: 'on_request_headers', interruptOnError: true };

/**
 * A group of optional app env keys behind a default/custom toggle: "custom" iff any key is set.
 * `omitDefaults` drops a value equal to its default (branding — the app applies its own).
 */
function envGroup(keys, defaults, { omitDefaults = false } = {}) {
    const entries = Object.entries(keys);

    return field.custom({
        writes: entries.map(([, env]) => ({ app: 'app', env })),
        load(state) {
            const env = appOf(state, 'app').env ?? {};
            const custom = entries.some(([, key]) => env[key] !== undefined);

            return {
                mode: custom ? 'custom' : 'default',
                ...Object.fromEntries(entries.map(([name, key]) => [name, env[key] ?? defaults[name]])),
            };
        },
        save(value, state) {
            const app = appOf(state, 'app');
            const env = { ...app.env };
            for (const [name, key] of entries) {
                const keep = value.mode === 'custom' && !(omitDefaults && value[name] === defaults[name]);
                if (keep) env[key] = value[name];
                else delete env[key];
            }
            app.env = env;
            return state;
        },
    });
}

// The auth prefix lives in two places that must agree: AUTH_PREFIX on both apps (the filter's bypass)
// and the app-route CDN rule that sends it to the app origin.
const authPrefix = field.custom({
    writes: [{ app: 'filter', env: 'AUTH_PREFIX' }, { app: 'app', env: 'AUTH_PREFIX' }, { cdnRules: 'app-route' }],
    load(state) {
        const [a, b] = BOTH.map((ref) => appOf(state, ref).env?.AUTH_PREFIX);
        if (a === undefined && b === undefined) throw fieldError('missing', 'AUTH_PREFIX is not set');
        if (a !== b) throw fieldError('diverged', 'AUTH_PREFIX differs between the filter and the app');
        return a;
    },
    save(value, state) {
        BOTH.forEach((ref) => {
            const app = appOf(state, ref);
            app.env = { ...app.env, AUTH_PREFIX: value };
        });
        const rules = state.cdnRules ?? [];
        const existing = rules.find((r) => r.ref === 'app-route');
        // Must outrank the filter rules (lower weight = higher priority): under "entire site" the
        // filter's catch-all also matches the auth prefix, and it carries no origin group.
        const route = {
            ref: 'app-route',
            name: existing?.name ?? `${baseName(state)}-auth-route`,
            rule: `^${escapeRegex(value)}`,
            weight: 1,
            originGroupRef: 'app-origin',
        };
        state.cdnRules = existing ? rules.map((r) => (r === existing ? route : r)) : [route, ...rules];
        return state;
    },
});

/**
 * Protection scope → the filter's CDN rules, one per protected path (`filter:<path>`) or one
 * catch-all (`filter:*`). A rule's Ref is its content, so editing a path replaces its rule.
 * Value: { scope: 'all' | 'paths', paths: string[] }.
 */
const protection = field.custom({
    writes: [{ cdnRules: 'filter:' }],
    load(state) {
        const rules = (state.cdnRules ?? []).filter((r) => r.ref.startsWith('filter:'));
        if (!rules.length) throw fieldError('missing', 'no filter rules are deployed');

        const all = rules.find((r) => r.ref === FILTER_ALL);
        if (all) {
            if (rules.length > 1 || all.rule !== FILTER_ALL_RULE) {
                throw new Error(`unrecognised catch-all filter rule "${all.rule}"`);
            }
            return { scope: 'all', paths: [] };
        }

        return {
            scope: 'paths',
            paths: rules.map((r) => {
                const path = r.ref.slice('filter:'.length);
                // Never normalise: a pattern edited by hand is reported, not silently rewritten.
                if (r.rule !== `^${escapeRegex(path)}`) throw new Error(`unrecognised filter rule "${r.rule}"`);
                return path;
            }),
        };
    },
    save(value, state) {
        const rules = state.cdnRules ?? [];
        const existing = new Map(rules.map((r) => [r.ref, r]));
        const base = baseName(state);
        const wanted =
            value.scope === 'all'
                ? [{ ref: FILTER_ALL, name: `${base}-mfa-filter`, rule: FILTER_ALL_RULE }]
                : value.paths.map((path, i) => ({
                      ref: `filter:${path}`,
                      name: `${base}-mfa-filter-${i + 1}`,
                      rule: `^${escapeRegex(path)}`,
                  }));
        const filterRules = wanted.map((w) => ({
            ...w,
            name: existing.get(w.ref)?.name ?? w.name,
            weight: 10,
            fastedgeFilter: filterBinding,
        }));
        state.cdnRules = [...rules.filter((r) => !r.ref.startsWith('filter:')), ...filterRules];
        return state;
    },
});

// The seed store is bound twice on the app — the KV read binding and KV_STORE_ID for the /enroll
// write path. One form value; on load the two must agree.
const store = field.custom({
    writes: [{ app: 'app', env: 'KV_STORE_ID' }, { app: 'app', store: 'TOTP_USER_SEEDS' }],
    load(state) {
        const app = appOf(state, 'app');
        const envId = app.env?.KV_STORE_ID;
        const boundId = app.storeRefs?.TOTP_USER_SEEDS;
        if (envId === undefined && boundId === undefined) throw fieldError('missing', 'no seed store is bound');
        if (envId !== String(boundId)) {
            throw fieldError('diverged', 'KV_STORE_ID and the TOTP_USER_SEEDS store binding disagree');
        }
        return { id: boundId, name: state.stores?.find((s) => s.id === boundId)?.name ?? `#${boundId}` };
    },
    save(value, state) {
        const app = appOf(state, 'app');
        app.env = { ...app.env, KV_STORE_ID: String(value.id) };
        app.storeRefs = { ...app.storeRefs, TOTP_USER_SEEDS: value.id };
        return state;
    },
});

// Read-only: Variant B is "the app has a proof signing key". Locked on Re-entry, so save is a no-op.
const variant = field.custom({
    writes: [],
    load: (state) => (appOf(state, 'app').secretRefs?.MFA_PROOF_SIGNING_KEY !== undefined ? 'B' : 'A'),
    save: (_value, state) => state,
});

export const TOTP_DEFAULTS = { issuer: 'TOTP', digits: '6', period: '30', algo: 'SHA1', drift: '1' };
export const POLICY_DEFAULTS = { sessionTtl: '28800', maxAttempts: '5', ticketTtl: '90', kvPrefix: 'totp:', selfEnroll: 'true' };
export const BRAND_DEFAULTS = { name: '', logo: '', favicon: '', color: DEFAULT_BRAND_COLOR, hover: '' };

export const fields = defineFieldMap({
    authPrefix,
    audience: field.env(BOTH, 'MFA_AUDIENCE'),
    cookie: field.env(BOTH, 'MFA_SESSION_COOKIE', { default: 'mfa_session' }),
    issuer: field.env(BOTH, 'MFA_ISSUER', { default: '', omitIfDefault: true }),
    loginUrl: field.env('filter', 'MFA_LOGIN_URL', { default: '', omitIfDefault: true }),
    protection,
    store,
    sessionKey: field.secret(BOTH, 'MFA_SESSION_KEY'),
    handoff: field.secret('app', 'HANDOFF_KEY'),
    enroll: field.secret('app', 'ENROLL_API_KEY'),
    gcore: field.secret('app', 'GCORE_API_TOKEN'),
    variant,
    proofKey: field.keypair('app', 'MFA_PROOF_SIGNING_KEY', 'MFA_PROOF_PUBLIC_JWK'),
    proofTtl: field.env('app', 'PROOF_TTL', { default: '90', omitIfDefault: true }),
    proofCookie: field.env('app', 'MFA_PROOF_COOKIE', { default: 'mfa_proof', omitIfDefault: true }),
    totp: envGroup(
        { issuer: 'TOTP_ISSUER', digits: 'TOTP_DIGITS', period: 'TOTP_PERIOD', algo: 'TOTP_ALGORITHM', drift: 'TOTP_DRIFT' },
        TOTP_DEFAULTS,
    ),
    policy: envGroup(
        {
            sessionTtl: 'MFA_SESSION_TTL',
            maxAttempts: 'MAX_ATTEMPTS',
            ticketTtl: 'TICKET_TTL',
            kvPrefix: 'KV_KEY_PREFIX',
            selfEnroll: 'ALLOW_SELF_ENROLLMENT',
        },
        POLICY_DEFAULTS,
    ),
    brand: envGroup(
        {
            name: 'TOTP_BRAND_NAME',
            logo: 'TOTP_BRAND_LOGO_URL',
            favicon: 'TOTP_BRAND_FAVICON_URL',
            color: 'TOTP_BRAND_BUTTON_COLOR',
            hover: 'TOTP_BRAND_BUTTON_HOVER_COLOR',
        },
        BRAND_DEFAULTS,
        { omitDefaults: true },
    ),
});

/** Template mode: the two apps, the app origin, and no rules yet — the field map fills the rest. */
export function skeleton({ name, filterT, appT, cdnResourceId }) {
    return {
        fastedgeApps: [
            { ref: 'filter', name: `${name}-filter`, api_type: 'proxy-wasm', source: { fromTemplateId: filterT.id }, env: {} },
            { ref: 'app', name: `${name}-app`, api_type: 'wasi-http', source: { fromTemplateId: appT.id }, env: {} },
        ],
        cdnResourceId,
        cdnOrigins: [{ ref: 'app-origin', name: `${name}-app-origin`, appRef: 'app' }],
        cdnRules: [],
    };
}

/** The deployment name, as Re-entry finds it (apps are named `<name>-filter` / `<name>-app`). */
export const deploymentName = (state) => baseName(state);

/** Form state → field-map values. Variant A leaves the proof fields untouched. */
export function fromForm(f) {
    return {
        authPrefix: f.authPrefix,
        audience: f.audience,
        cookie: f.cookie,
        issuer: f.issuer,
        loginUrl: f.loginUrl,
        protection: { scope: f.protectionScope, paths: parseProtectedPaths(f.protectedPaths) },
        store: f.store,
        sessionKey: f.sessionKey,
        handoff: f.handoff,
        enroll: f.enroll,
        gcore: f.gcore,
        ...(f.variant === 'B' ? { proofKey: f.proofKey, proofTtl: f.proofTtl, proofCookie: f.proofCookie } : {}),
        totp: {
            mode: f.totpMode,
            issuer: f.totpIssuer,
            digits: f.totpDigits,
            period: f.totpPeriod,
            algo: f.totpAlgo,
            drift: f.totpDrift,
        },
        policy: {
            mode: f.policyMode,
            sessionTtl: f.sessionTtl,
            maxAttempts: f.maxAttempts,
            ticketTtl: f.ticketTtl,
            kvPrefix: f.kvPrefix,
            selfEnroll: f.selfEnroll,
        },
        brand: {
            mode: f.brandMode,
            name: f.brandName,
            logo: f.brandLogo,
            favicon: f.brandFavicon,
            color: f.brandColor,
            hover: f.brandHover,
        },
    };
}

/** Field-map values (as loaded; errored fields absent) → a patch of form state. */
export function toForm(v) {
    const pick = (key, value) => (v[key] === undefined ? {} : value);

    return {
        ...pick('authPrefix', { authPrefix: v.authPrefix }),
        ...pick('audience', { audience: v.audience }),
        ...pick('cookie', { cookie: v.cookie }),
        ...pick('issuer', { issuer: v.issuer }),
        ...pick('loginUrl', { loginUrl: v.loginUrl }),
        ...pick('protection', {
            protectionScope: v.protection?.scope,
            protectedPaths: v.protection?.paths.join(', '),
        }),
        ...pick('store', { store: v.store }),
        ...pick('sessionKey', { sessionKey: v.sessionKey }),
        ...pick('handoff', { handoff: v.handoff }),
        ...pick('enroll', { enroll: v.enroll }),
        ...pick('gcore', { gcore: v.gcore }),
        ...pick('variant', { variant: v.variant }),
        ...pick('proofKey', { proofKey: v.proofKey }),
        ...pick('proofTtl', { proofTtl: v.proofTtl }),
        ...pick('proofCookie', { proofCookie: v.proofCookie }),
        ...pick('totp', {
            totpMode: v.totp?.mode,
            totpIssuer: v.totp?.issuer,
            totpDigits: v.totp?.digits,
            totpPeriod: v.totp?.period,
            totpAlgo: v.totp?.algo,
            totpDrift: v.totp?.drift,
        }),
        ...pick('policy', {
            policyMode: v.policy?.mode,
            sessionTtl: v.policy?.sessionTtl,
            maxAttempts: v.policy?.maxAttempts,
            ticketTtl: v.policy?.ticketTtl,
            kvPrefix: v.policy?.kvPrefix,
            selfEnroll: v.policy?.selfEnroll,
        }),
        ...pick('brand', {
            brandMode: v.brand?.mode,
            brandName: v.brand?.name,
            brandLogo: v.brand?.logo,
            brandFavicon: v.brand?.favicon,
            brandColor: v.brand?.color,
            brandHover: v.brand?.hover,
        }),
    };
}

/**
 * Re-entry: the live deployment → { form patch, errors }. Variant A has no proof key, so its
 * `missing` is expected, not an error.
 */
export function loadForm(state) {
    const { values, errors } = fields.load(state);
    const { proofKey, ...rest } = errors;
    const keep = values.variant === 'B' || proofKey?.code !== 'missing';

    return { form: toForm(values), errors: keep && proofKey ? { ...rest, proofKey } : rest };
}

/**
 * Re-entry save values. A field that couldn't be loaded shows its default in the form; unless the
 * user changed it, leave the deployed value alone rather than overwrite it with that default.
 */
export function reentryValues(f, loadedForm, errors) {
    const values = fromForm(f);
    const loaded = fromForm(loadedForm);
    for (const key of Object.keys(errors)) {
        if (JSON.stringify(values[key]) === JSON.stringify(loaded[key])) delete values[key];
    }
    return values;
}

/**
 * The deploy params for a saved state. Template mode creates (`newCdn*`); Re-entry sends the
 * complete desired state plus the revision it was read at.
 */
export function toPlan(state, revision) {
    const fastedgeApps = state.fastedgeApps.map(({ ref, name, api_type, source, env, secretRefs, storeRefs }) => ({
        ref,
        name,
        api_type,
        source,
        env,
        ...(secretRefs ? { secretRefs } : {}),
        ...(storeRefs ? { storeRefs } : {}),
    }));
    const cdn =
        revision === undefined
            ? { newCdnOrigins: state.cdnOrigins, newCdnRules: state.cdnRules }
            : { cdnOrigins: state.cdnOrigins, cdnRules: state.cdnRules, revision };

    return { fastedgeApps, cdnResourceId: state.cdnResourceId, ...cdn };
}
