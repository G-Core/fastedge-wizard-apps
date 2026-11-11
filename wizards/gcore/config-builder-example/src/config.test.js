import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    actionLabel,
    conditionLabel,
    configBytes,
    emptyConfig,
    newAction,
    newNode,
    addRule,
    moveRule,
    nodeAt,
    removeRule,
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

test('tree edits are immutable and address nodes by path', () => {
    const added = updateNode(CONFIG, '0', (n) => ({ ...n, children: [...n.children, newNode('device')] }));
    assert.equal(added.root.children[0].children[1].type, 'device');
    assert.equal(CONFIG.root.children[0].children.length, 1);
    assert.equal(nodeAt(CONFIG, '0.0').prefix, '/shop');
    assert.equal(conditionLabel(nodeAt(CONFIG, '0.0')), '/shop*');
    assert.equal(nodeAt(CONFIG, '5'), undefined);
});

test('outline labels say what a rule matches and where it sends the request', () => {
    assert.equal(conditionLabel(CONFIG.root.children[0]), 'FR, BE');
    assert.equal(conditionLabel({ ...newNode('country'), countries: ['A', 'B', 'C', 'D', 'E', 'F'] }), 'A, B, C, D +2');
    assert.equal(conditionLabel({ ...newNode('header'), name: 'X-Tier', operator: 'exists' }), 'X-Tier exists');
    assert.equal(actionLabel(CONFIG.root.children[0].action), 'redirect 302 https://fr.example.com/');
});

test('size is measured in encoded bytes', () => {
    assert.equal(configBytes({ a: 'é' }), JSON.stringify({ a: 'é' }).length + 1);
});

test('rules: add returns the new path; move swaps siblings (order decides the winner); remove drops one', () => {
    const added = addRule(CONFIG, '', 'header');
    assert.equal(added.path, '2');
    assert.equal(nodeAt(added.config, '2').type, 'header');

    const up = moveRule(added.config, '2', -1);
    assert.equal(up.path, '1');
    assert.deepEqual(up.config.root.children.map((c) => c.type), ['country', 'header', 'device']);
    assert.equal(moveRule(up.config, '0', -1).path, '0', 'the first rule cannot move up');

    assert.deepEqual(removeRule(up.config, '1').root.children.map((c) => c.type), ['country', 'device']);
});
