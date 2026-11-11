import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fields, fromForm, loadForm, reentryValues, skeleton, toPlan } from './deployment.js';

const FORM = {
    authPrefix: '/auth/totp',
    audience: 'https://shop.example.com',
    cookie: 'mfa_session',
    issuer: '',
    loginUrl: 'https://shop.example.com/login/mfa',
    protectionScope: 'paths',
    protectedPaths: '/checkout, /account.v2',
    store: { id: 7, name: 'seeds' },
    sessionKey: { id: 11, name: 'session-key' },
    handoff: { id: 12, name: 'handoff' },
    enroll: { id: 13, name: 'enroll' },
    gcore: { id: 14, name: 'api-token' },
    variant: 'A',
    proofKey: null,
    proofTtl: '90',
    proofCookie: 'mfa_proof',
    totpMode: 'custom',
    totpIssuer: 'Shop',
    totpDigits: '8',
    totpPeriod: '30',
    totpAlgo: 'SHA256',
    totpDrift: '1',
    policyMode: 'default',
    sessionTtl: '28800',
    maxAttempts: '5',
    ticketTtl: '90',
    kvPrefix: 'totp:',
    selfEnroll: 'true',
    brandMode: 'custom',
    brandName: 'Shop',
    brandLogo: '',
    brandFavicon: '',
    brandColor: '#0066cc',
    brandHover: '',
};

const TEMPLATES = { name: 'totp', filterT: { id: 1 }, appT: { id: 2 }, cdnResourceId: 900 };

/** What a template-mode deploy creates, then read back as deployment.current() would return it. */
function deployed(form = FORM) {
    const state = fields.save(fromForm(form), skeleton(TEMPLATES));
    const secrets = [FORM.sessionKey, FORM.handoff, FORM.enroll, FORM.gcore, ...(form.proofKey ? [form.proofKey] : [])];
    return { ...state, secrets: secrets.map(({ id, name }) => ({ id, name })), stores: [{ id: 7, name: 'seeds' }] };
}

test('template mode: one save builds both apps, the route and one filter rule per path', () => {
    const plan = toPlan(fields.save(fromForm(FORM), skeleton(TEMPLATES)));
    const [filter, app] = plan.fastedgeApps;

    assert.deepEqual(filter.env, {
        AUTH_PREFIX: '/auth/totp',
        MFA_AUDIENCE: 'https://shop.example.com',
        MFA_SESSION_COOKIE: 'mfa_session',
        MFA_LOGIN_URL: 'https://shop.example.com/login/mfa',
    });
    assert.equal(app.env.KV_STORE_ID, '7');
    assert.equal(app.env.TOTP_ALGORITHM, 'SHA256');
    assert.equal(app.env.TOTP_BRAND_NAME, 'Shop');
    assert.equal(app.env.TOTP_BRAND_BUTTON_COLOR, undefined, 'default colour is omitted');
    assert.equal(app.env.MAX_ATTEMPTS, undefined, 'default policy writes nothing');
    assert.deepEqual(app.storeRefs, { TOTP_USER_SEEDS: 7 });
    assert.deepEqual(filter.secretRefs, { MFA_SESSION_KEY: 11 });
    assert.equal(app.secretRefs.MFA_PROOF_SIGNING_KEY, undefined);

    assert.deepEqual(
        plan.newCdnRules.map((r) => [r.ref, r.rule, r.weight]),
        [
            ['app-route', '^/auth/totp', 1],
            ['filter:/checkout', '^/checkout', 10],
            ['filter:/account.v2', '^/account\\.v2', 10],
        ],
    );
    assert.equal(plan.newCdnOrigins[0].ref, 'app-origin');
    assert.equal(plan.cdnRules, undefined);
});

test('Re-entry: load gives back the form; saving it unchanged changes nothing', () => {
    const live = deployed();
    const { form, errors } = loadForm(live);

    assert.deepEqual(errors, {}, 'Variant A: no proof key is expected, not an error');
    assert.deepEqual({ ...FORM, ...form }, FORM);
    assert.deepEqual(fields.save(fromForm({ ...FORM, ...form }), live), live);
});

test('Re-entry plan carries desired state and the revision', () => {
    const plan = toPlan(deployed(), 'rev-1');
    assert.equal(plan.revision, 'rev-1');
    assert.equal(plan.newCdnRules, undefined);
    assert.equal(plan.cdnRules.length, 3);
    assert.equal(plan.fastedgeApps[0].secrets, undefined, 'lookups never go into the plan');
});

test('keys the wizard does not map survive a round trip (hand edits in the dashboard)', () => {
    const live = deployed();
    live.fastedgeApps[1].env.HAND_ADDED = 'x';
    live.cdnRules.push({ ref: 'hand-rule', name: 'mine', rule: '^/x' });

    const next = fields.save(fromForm({ ...FORM, audience: 'https://b.example.com' }), live);
    assert.equal(next.fastedgeApps[1].env.HAND_ADDED, 'x');
    assert.ok(next.cdnRules.some((r) => r.ref === 'hand-rule'));
});

test('protection: a path change replaces its rule; kept paths keep their names', () => {
    const live = deployed();
    live.cdnRules.find((r) => r.ref === 'filter:/checkout').name = 'renamed-by-hand';

    const next = fields.save(fromForm({ ...FORM, protectedPaths: '/checkout, /billing' }), live);
    const filters = next.cdnRules.filter((r) => r.ref.startsWith('filter:'));
    assert.deepEqual(
        filters.map((r) => [r.ref, r.name]),
        [
            ['filter:/checkout', 'renamed-by-hand'],
            ['filter:/billing', 'totp-mfa-filter-2'],
        ],
    );
});

test('protection: entire site round-trips as one catch-all rule', () => {
    const live = deployed({ ...FORM, protectionScope: 'all', protectedPaths: '' });
    assert.deepEqual(
        live.cdnRules.map((r) => r.ref),
        ['app-route', 'filter:*'],
    );
    assert.deepEqual(fields.load(live).values.protection, { scope: 'all', paths: [] });
});

test('protection: a hand-edited pattern is reported invalid, never normalised', () => {
    const live = deployed();
    live.cdnRules.find((r) => r.ref === 'filter:/checkout').rule = '^/checkout/.*';
    assert.equal(fields.load(live).errors.protection.code, 'invalid');
});

test('authPrefix: moves the route rule and both env keys together; diverged when they disagree', () => {
    const next = fields.save({ authPrefix: '/mfa' }, deployed());
    assert.deepEqual(
        next.fastedgeApps.map((a) => a.env.AUTH_PREFIX),
        ['/mfa', '/mfa'],
    );
    assert.equal(next.cdnRules.find((r) => r.ref === 'app-route').rule, '^/mfa');

    const live = deployed();
    live.fastedgeApps[0].env.AUTH_PREFIX = '/other';
    assert.equal(fields.load(live).errors.authPrefix.code, 'diverged');
});

test('store: KV_STORE_ID and the store binding must agree', () => {
    const live = deployed();
    live.fastedgeApps[1].env.KV_STORE_ID = '8';
    assert.equal(fields.load(live).errors.store.code, 'diverged');
});

test('env groups: back to default removes every key; custom round-trips', () => {
    const next = fields.save(fromForm({ ...FORM, totpMode: 'default', brandMode: 'none' }), deployed());
    const env = next.fastedgeApps[1].env;
    assert.equal(
        Object.keys(env).some((k) => k.startsWith('TOTP_')),
        false,
    );
    assert.equal(fields.load(next).values.totp.mode, 'default');
    assert.equal(fields.load(deployed()).values.brand.name, 'Shop');
});

test('variant B: keypair and proof settings round-trip; the variant is read from the key', () => {
    const form = {
        ...FORM,
        variant: 'B',
        proofKey: { id: 20, name: 'proof', publicKey: '{"kty":"EC"}' },
        proofTtl: '120',
    };
    const live = deployed(form);
    const { values } = fields.load(live);

    assert.equal(values.variant, 'B');
    assert.deepEqual(values.proofKey, { id: 20, name: 'proof', publicKey: '{"kty":"EC"}' });
    assert.equal(values.proofTtl, '120');
    assert.equal(live.fastedgeApps[1].env.MFA_PROOF_COOKIE, undefined, 'default proof cookie omitted');
});

test('Re-entry: an unreadable field keeps its deployed value unless the user edits it', () => {
    const live = deployed();
    live.cdnRules.find((r) => r.ref === 'filter:/checkout').rule = '^/checkout/.*';
    const { form, errors } = loadForm(live);
    const loaded = { ...FORM, ...form };

    const untouched = fields.save(reentryValues(loaded, loaded, errors), live);
    assert.equal(untouched.cdnRules.find((r) => r.ref === 'filter:/checkout').rule, '^/checkout/.*');

    const edited = { ...loaded, protectionScope: 'all' };
    const next = fields.save(reentryValues(edited, loaded, errors), live);
    assert.deepEqual(
        next.cdnRules.map((r) => r.ref),
        ['app-route', 'filter:*'],
    );
});
