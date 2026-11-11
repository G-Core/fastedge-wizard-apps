import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ENV_KEY,
    configBytes,
    emptyConfig,
    fields,
    newAction,
    newNode,
    skeleton,
    toPlan,
    updateNode,
    upgrade,
    validate,
} from './config.js';

const CONFIG = {
    schemaVersion: 1,
    root: {
        type: 'root',
        action: { kind: 'origin', host: 'www.example.com' },
        children: [
            {
                type: 'country',
                countries: ['FR', 'BE'],
                children: [
                    {
                        type: 'path',
                        prefix: '/shop',
                        children: [],
                        action: { kind: 'origin', host: 'shop-eu.example.com', headers: [{ name: 'X-Region', value: 'eu' }] },
                    },
                ],
                action: { kind: 'redirect', status: 302, url: 'https://fr.example.com/' },
            },
            { type: 'device', device: 'bot', children: [], action: { kind: 'respond', status: 403, body: 'no bots' } },
        ],
    },
};

const deployedWith = (env) => ({
    fastedgeApps: [{ ref: 'main', name: 'router', api_type: 'wasi-http', source: { fromTemplateId: 1 }, env }],
});

test('a valid tree has no errors; the empty config only needs its origin filled in', () => {
    assert.deepEqual(validate(CONFIG), {});
    assert.deepEqual(validate(emptyConfig()), { '': ['origin must be a hostname, e.g. api.example.com'] });
});

test('validation: leaf actions, paths, https redirects, status ranges, countries, nesting, duplicates', () => {
    const bad = {
        schemaVersion: 1,
        root: {
            type: 'root',
            children: [
                { type: 'path', prefix: 'shop', children: [] },
                { type: 'country', countries: [], children: [], action: { kind: 'redirect', status: 302, url: 'http://x.com' } },
                { type: 'device', device: 'bot', children: [{ type: 'path', prefix: '/a', children: [], action: newAction('rewrite') }], action: { kind: 'respond', status: 700, body: '' } },
                { type: 'device', device: 'bot', children: [], action: newAction('rewrite') },
            ],
        },
    };
    const errors = validate(bad);

    assert.deepEqual(errors['0'], ['path prefix must start with /', 'a leaf needs an action']);
    assert.deepEqual(errors['1'], ['pick at least one country', 'redirect URL must be an absolute https:// URL']);
    assert.deepEqual(errors['2'], ['status must be 100–599']);
    assert.deepEqual(errors['2.0'], ["Path prefix can't go under Device"]);
    assert.deepEqual(errors['3'], ['duplicates an earlier sibling condition']);
    assert.equal(errors[''], undefined, 'an inner root needs no action');
});

test('upgrade: v1 passes through, v0 flat routes become path nodes, unknown versions are refused', () => {
    assert.equal(upgrade(CONFIG), CONFIG);

    const v0 = upgrade({ routes: [{ pathPrefix: '/api', origin: 'api.example.com' }], defaultOrigin: 'www.example.com' });
    assert.deepEqual(v0, {
        schemaVersion: 1,
        root: {
            type: 'root',
            children: [{ type: 'path', prefix: '/api', children: [], action: { kind: 'origin', host: 'api.example.com' } }],
            action: { kind: 'origin', host: 'www.example.com' },
        },
    });
    assert.deepEqual(validate(v0), {});

    assert.throws(() => upgrade({ schemaVersion: 2, root: {} }), /unsupported schemaVersion 2/);
    assert.throws(() => upgrade([1]), /not a JSON object/);
});

test('field map: template mode writes compact JSON; Re-entry loads it back unchanged', () => {
    const state = fields.save({ config: CONFIG }, skeleton({ name: 'router', templateId: 1 }));
    assert.equal(state.fastedgeApps[0].env[ENV_KEY], JSON.stringify(CONFIG));
    assert.deepEqual(toPlan(state), { fastedgeApps: state.fastedgeApps });

    const live = { ...state, fastedgeApps: [{ ...state.fastedgeApps[0], env: { ...state.fastedgeApps[0].env, HAND: 'x' } }] };
    const { values, errors } = fields.load(live);
    assert.deepEqual(errors, {});
    assert.deepEqual(values.config, CONFIG);
    assert.deepEqual(fields.save(values, live), live, 'unchanged config + hand-added key survive');
    assert.equal(toPlan(live, 'rev-1').revision, 'rev-1');
});

test('field map: broken JSON, an unknown version and a missing key are reported, with the raw value', () => {
    assert.equal(fields.load(deployedWith({ [ENV_KEY]: '{not json' })).errors.config.code, 'invalid');

    const future = fields.load(deployedWith({ [ENV_KEY]: '{"schemaVersion":9}' })).errors.config;
    assert.equal(future.code, 'invalid');
    assert.equal(future.raw, '{"schemaVersion":9}');

    assert.equal(fields.load(deployedWith({})).errors.config.code, 'missing');
});

test('field map: an invalid tree is refused on save', () => {
    assert.throws(() => fields.save({ config: emptyConfig() }, skeleton({ name: 'r', templateId: 1 })), /validation errors/);
});

test('tree edits are immutable and address nodes by path', () => {
    const added = updateNode(CONFIG, '0', (n) => ({ ...n, children: [...n.children, newNode('device')] }));
    assert.equal(added.root.children[0].children[1].type, 'device');
    assert.equal(CONFIG.root.children[0].children.length, 1);

});

test('size is measured in encoded bytes', () => {
    assert.equal(configBytes({ a: 'é' }), JSON.stringify({ a: 'é' }).length + 1);
});
