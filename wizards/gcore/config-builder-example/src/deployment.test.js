import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emptyConfig } from './config.js';
import { ENV_KEY, fields, loadForm, skeleton, toDeployPlan, toPlan } from './deployment.js';

const CONFIG = {
    schemaVersion: 1,
    root: {
        type: 'root',
        action: { kind: 'origin', host: 'www.example.com' },
        children: [{ type: 'path', prefix: '/shop', children: [], action: { kind: 'origin', host: 'shop.example.com' } }],
    },
};

const deployedWith = (env) => ({
    revision: 'rev-1',
    fastedgeApps: [{ ref: 'main', name: 'router', api_type: 'wasi-http', source: { fromTemplateId: 1 }, env }],
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
});

test('field map: broken JSON, an unknown version and a missing key are reported, with the raw value', () => {
    assert.equal(fields.load(deployedWith({ [ENV_KEY]: '{not json' })).errors.config.code, 'invalid');

    const future = fields.load(deployedWith({ [ENV_KEY]: '{"schemaVersion":9}' })).errors.config;
    assert.equal(future.code, 'invalid');
    assert.equal(future.raw, '{"schemaVersion":9}');

    assert.equal(fields.load(deployedWith({})).errors.config.code, 'missing');

    // A malformed tree (a null child) is a load error, not a crash when the form validates it.
    const nullChild = JSON.stringify({ schemaVersion: 1, root: { type: 'root', children: [null] } });
    assert.equal(fields.load(deployedWith({ [ENV_KEY]: nullChild })).errors.config.code, 'invalid');
});

test('field map: an invalid tree is refused on save', () => {
    assert.throws(() => fields.save({ config: emptyConfig() }, skeleton({ name: 'r', templateId: 1 })), /validation errors/);
});

test('loadForm: template mode starts empty; Re-entry reads name + config; a bad value keeps the error', () => {
    assert.deepEqual(loadForm(null), { name: 'router', config: emptyConfig(), error: null });

    assert.deepEqual(loadForm(deployedWith({ [ENV_KEY]: JSON.stringify(CONFIG) })), { name: 'router', config: CONFIG, error: null });

    const broken = loadForm(deployedWith({ [ENV_KEY]: '{not json' }));
    assert.deepEqual(broken.config, emptyConfig());
    assert.equal(broken.error.code, 'invalid');
});

test('toDeployPlan: template mode creates from the template; Re-entry updates the live app with its revision', () => {
    assert.deepEqual(toDeployPlan({ name: 'edge', config: CONFIG }, { current: null, templateId: 7 }), {
        fastedgeApps: [{ ref: 'main', name: 'edge', api_type: 'wasi-http', source: { fromTemplateId: 7 }, env: { [ENV_KEY]: JSON.stringify(CONFIG) } }],
    });

    const current = deployedWith({ [ENV_KEY]: '{}', HAND: 'x' });
    const plan = toDeployPlan({ name: 'ignored', config: CONFIG }, { current });
    assert.equal(plan.revision, 'rev-1');
    assert.equal(plan.fastedgeApps[0].name, 'router', 'Re-entry keeps the live name');
    assert.deepEqual(plan.fastedgeApps[0].env, { [ENV_KEY]: JSON.stringify(CONFIG), HAND: 'x' });
});
