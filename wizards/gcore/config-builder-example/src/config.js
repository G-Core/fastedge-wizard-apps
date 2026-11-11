// The request-router config: a tree of conditions with an action on every leaf, saved as one JSON
// env value (ROUTER_CONFIG) on one app (Ref `main`). Everything here is pure — no session, no React.
//
//   { schemaVersion: 1, root: Node }
//   Node   = { type, ...condition fields, children: Node[], action?: Action }
//   Action = { kind: 'origin' | 'redirect' | 'rewrite' | 'respond', ..., headers?: [{ name, value }] }
//
// An inner node's action is the fallback when none of its children match; a leaf must have one.
import { defineFieldMap, field } from '@gcoredev/fastedge-wizard-sdk';

import { COUNTRIES } from './data/countries.js';

export const SCHEMA_VERSION = 1;
export const ENV_KEY = 'ROUTER_CONFIG';

/**
 * The host caps a deployment.plan message at 1 MB (every app's env travels in it) and rejects a larger
 * one with invalid_params. The config gets most of that; warn as it gets close, block before the cap.
 */
export const BRIDGE_LIMIT_BYTES = 1024 * 1024;
/** The config's share of the plan message, leaving room for the rest of it. */
export const MAX_CONFIG_BYTES = 960 * 1024;
export const SIZE_WARN_BYTES = 768 * 1024;
/** Above this a plain env read (std::env / WASI) fails — the app must use dictionary::get. */
export const ENV_READ_LIMIT_BYTES = 64 * 1024;

export const NODE_TYPES = {
    root: { label: 'All requests' },
    country: { label: 'Country' },
    path: { label: 'Path prefix' },
    header: { label: 'Header match' },
    device: { label: 'Device' },
};

/** Which condition types may nest under which — broad to narrow. */
export const ALLOWED_CHILDREN = {
    root: ['country', 'path', 'header', 'device'],
    country: ['path', 'header', 'device'],
    path: ['header', 'device'],
    header: ['device'],
    device: [],
};

export const ACTION_KINDS = {
    origin: 'Send to origin',
    redirect: 'Redirect',
    rewrite: 'Rewrite path',
    respond: 'Respond directly',
};

export const HEADER_OPERATORS = ['equals', 'contains', 'exists'];
export const DEVICES = ['mobile', 'desktop', 'bot'];
export const REDIRECT_STATUSES = [301, 302, 307];
export const MAX_BODY = 256;

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

// ── Constructors ─────────────────────────────────────────────────────────────

export function newNode(type) {
    const fields = {
        country: { countries: [] },
        path: { prefix: '/' },
        header: { name: '', operator: 'equals', value: '' },
        device: { device: 'mobile' },
    }[type];
    return { type, ...fields, children: [] };
}

export function newAction(kind) {
    return {
        origin: { kind, host: '' },
        redirect: { kind, status: 302, url: 'https://' },
        rewrite: { kind, path: '/' },
        respond: { kind, status: 403, body: '' },
    }[kind];
}

/** Template mode starts here: every request goes to one origin the user fills in. */
export const emptyConfig = () => ({
    schemaVersion: SCHEMA_VERSION,
    root: { type: 'root', children: [], action: newAction('origin') },
});

// ── schemaVersion upgrade ───────────────────────────────────────────────────

/**
 * Decode what is deployed into the current schema. v0 (the pre-release format) was a flat list of
 * `{ pathPrefix, origin }` routes; it upgrades to path nodes under the root. Anything else that
 * isn't v1 throws — the field map reports it `invalid` and the wizard offers a reset.
 */
export function upgrade(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a JSON object');

    if (raw.schemaVersion === undefined && Array.isArray(raw.routes)) {
        return {
            schemaVersion: SCHEMA_VERSION,
            root: {
                type: 'root',
                children: raw.routes.map((r) => ({
                    type: 'path',
                    prefix: String(r.pathPrefix),
                    children: [],
                    action: { kind: 'origin', host: String(r.origin) },
                })),
                ...(raw.defaultOrigin ? { action: { kind: 'origin', host: String(raw.defaultOrigin) } } : {}),
            },
        };
    }
    if (raw.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(`unsupported schemaVersion ${JSON.stringify(raw.schemaVersion)} (this wizard writes ${SCHEMA_VERSION})`);
    }
    if (raw.root?.type !== 'root' || !Array.isArray(raw.root.children)) throw new Error('missing the root node');
    return raw;
}

// ── Validation ───────────────────────────────────────────────────────────────

const isHostname = (h) => /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(h);
const isHttpsUrl = (u) => {
    try {
        return new URL(u).protocol === 'https:';
    } catch {
        return false;
    }
};
const inRange = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

/** A condition's identity among its siblings (two siblings with the same one could never both match). */
export function conditionKey(node) {
    switch (node.type) {
        case 'country':
            return `country:${[...node.countries].sort().join(',')}`;
        case 'path':
            return `path:${node.prefix}`;
        case 'header':
            return `header:${node.name.toLowerCase()}:${node.operator}:${node.operator === 'exists' ? '' : node.value}`;
        case 'device':
            return `device:${node.device}`;
        default:
            return node.type;
    }
}

function conditionErrors(node) {
    switch (node.type) {
        case 'country':
            if (!node.countries.length) return ['pick at least one country'];
            return node.countries.filter((c) => !COUNTRY_CODES.has(c)).map((c) => `unknown country code "${c}"`);
        case 'path':
            return node.prefix.startsWith('/') ? [] : ['path prefix must start with /'];
        case 'header': {
            const errs = [];
            if (!/^[A-Za-z0-9-]+$/.test(node.name)) errs.push('header name: letters, digits and - only');
            if (!HEADER_OPERATORS.includes(node.operator)) errs.push('unknown operator');
            if (node.operator !== 'exists' && !node.value) errs.push('header value is required');
            return errs;
        }
        case 'device':
            return DEVICES.includes(node.device) ? [] : ['unknown device'];
        default:
            return [];
    }
}

function actionErrors(action) {
    const errs = [];
    switch (action.kind) {
        case 'origin':
            if (!isHostname(action.host)) errs.push('origin must be a hostname, e.g. api.example.com');
            break;
        case 'redirect':
            if (!REDIRECT_STATUSES.includes(action.status)) errs.push('redirect status must be 301, 302 or 307');
            if (!isHttpsUrl(action.url)) errs.push('redirect URL must be an absolute https:// URL');
            break;
        case 'rewrite':
            if (!action.path.startsWith('/')) errs.push('rewrite path must start with /');
            break;
        case 'respond':
            if (!inRange(action.status, 100, 599)) errs.push('status must be 100–599');
            if (action.body.length > MAX_BODY) errs.push(`body is limited to ${MAX_BODY} characters`);
            break;
        default:
            errs.push('unknown action');
    }
    for (const h of action.headers ?? []) {
        if (!/^[A-Za-z0-9-]+$/.test(h.name)) errs.push(`header "${h.name}": letters, digits and - only`);
    }
    return errs;
}

/**
 * Every problem in the tree, keyed by node path ('' = root, '0.2' = root.children[0].children[2]).
 * An empty object means the config can be deployed.
 */
export function validate(config) {
    const errors = {};
    const add = (path, msgs) => {
        if (msgs.length) errors[path] = [...(errors[path] ?? []), ...msgs];
    };

    const walk = (node, path) => {
        add(path, conditionErrors(node));
        if (node.action) add(path, actionErrors(node.action));
        else if (!node.children.length) add(path, ['a leaf needs an action']);

        const seen = new Set();
        node.children.forEach((child, i) => {
            const childPath = path === '' ? String(i) : `${path}.${i}`;
            if (!ALLOWED_CHILDREN[node.type].includes(child.type)) {
                add(childPath, [`${NODE_TYPES[child.type]?.label ?? child.type} can't go under ${NODE_TYPES[node.type].label}`]);
            }
            const key = conditionKey(child);
            if (seen.has(key)) add(childPath, ['duplicates an earlier sibling condition']);
            seen.add(key);
            walk(child, childPath);
        });
    };

    walk(config.root, '');
    return errors;
}

/** Bytes of the encoded config (what crosses the bridge and is stored). */
export const configBytes = (config) => new TextEncoder().encode(JSON.stringify(config)).length;

// ── Tree edits (immutable) ───────────────────────────────────────────────────

const pathIndexes = (path) => (path === '' ? [] : path.split('.').map(Number));

/** Replace the node at `path` with `fn(node)`. */
export function updateNode(config, path, fn) {
    const go = (node, rest) => {
        if (!rest.length) return fn(node);
        const [i, ...tail] = rest;
        return { ...node, children: node.children.map((c, j) => (j === i ? go(c, tail) : c)) };
    };
    return { ...config, root: go(config.root, pathIndexes(path)) };
}

// ── Field map + plan ─────────────────────────────────────────────────────────

export const fields = defineFieldMap({
    config: field.env('main', ENV_KEY, {
        codec: field.json({
            parse: upgrade,
            validate: (config) => {
                const errors = validate(config);
                if (Object.keys(errors).length) throw new Error('the config has validation errors');
            },
        }),
    }),
});

/** Template mode: the one app, with no config yet — the field map writes it. */
export const skeleton = ({ name, templateId }) => ({
    fastedgeApps: [{ ref: 'main', name, api_type: 'wasi-http', source: { fromTemplateId: templateId }, env: {} }],
});

/** Deploy params for a saved state. Re-entry sends the revision it read; no CDN in this wizard. */
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
    return revision === undefined ? { fastedgeApps } : { fastedgeApps, revision };
}
