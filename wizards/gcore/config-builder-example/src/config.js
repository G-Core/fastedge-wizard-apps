// The request-router config: a tree of conditions with an action on every leaf. Everything here is
// pure — no session, no React. How the config gets into and out of the app is in deployment.js.
//
//   { schemaVersion: 1, root: Node }
//   Node   = { type, ...condition fields, children: Node[], action?: Action }
//   Action = { kind: 'origin' | 'redirect' | 'rewrite' | 'respond', ..., headers?: [{ name, value }] }
//
// An inner node's action is the fallback when none of its children match; a leaf must have one.
import { COUNTRIES } from './data/countries.js';

export const SCHEMA_VERSION = 1;

/**
 * The host caps a deployment.plan message at 1 MB (every app's env travels in it) and rejects a larger
 * one with invalid_params. Measure the serialized plan, not the config: the config is a JSON string
 * inside it, so every quote and backslash is escaped again. Warn as it gets close, block before the cap.
 */
export const BRIDGE_LIMIT_BYTES = 1024 * 1024;
/** The plan's share of the message, leaving room for the message envelope. */
export const MAX_PLAN_BYTES = BRIDGE_LIMIT_BYTES - 4 * 1024;
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

/** Bytes of a value as JSON: the config (what the app stores) or a whole plan (what crosses the bridge). */
export const configBytes = (config) => new TextEncoder().encode(JSON.stringify(config)).length;

// ── Tree edits (immutable) ───────────────────────────────────────────────────

// A node's path is its child indexes from the root: '' = root, '0.2' = root.children[0].children[2].
const pathIndexes = (path) => (path === '' ? [] : path.split('.').map(Number));
export const childPath = (path, i) => (path === '' ? String(i) : `${path}.${i}`);
export const parentPath = (path) => path.split('.').slice(0, -1).join('.');
const indexOf = (path) => Number(path.split('.').pop());

/** The node at `path`, or undefined if there's none (e.g. after a removal). */
export const nodeAt = (config, path) => pathIndexes(path).reduce((node, i) => node?.children[i], config.root);

/** Replace the node at `path` with `fn(node)`. */
export function updateNode(config, path, fn) {
    const go = (node, rest) => {
        if (!rest.length) return fn(node);
        const [i, ...tail] = rest;
        return { ...node, children: node.children.map((c, j) => (j === i ? go(c, tail) : c)) };
    };
    return { ...config, root: go(config.root, pathIndexes(path)) };
}

/** Add a rule of `type` as the last child of `path`. Returns the new config and the new rule's path. */
export function addRule(config, path, type) {
    const at = nodeAt(config, path).children.length;
    return { config: updateNode(config, path, (n) => ({ ...n, children: [...n.children, newNode(type)] })), path: childPath(path, at) };
}

export function removeRule(config, path) {
    const i = indexOf(path);
    return updateNode(config, parentPath(path), (n) => ({ ...n, children: n.children.filter((_, j) => j !== i) }));
}

/** Swap the rule at `path` with its sibling `delta` places away (order decides which rule wins). Returns the rule's new path. */
export function moveRule(config, path, delta) {
    const i = indexOf(path);
    const j = i + delta;
    const parent = parentPath(path);
    if (j < 0 || j >= nodeAt(config, parent).children.length) return { config, path };
    const swapped = updateNode(config, parent, (n) => {
        const children = [...n.children];
        [children[i], children[j]] = [children[j], children[i]];
        return { ...n, children };
    });
    return { config: swapped, path: childPath(parent, j) };
}

// ── One-line summaries (the outline) ─────────────────────────────────────────

/** What a rule matches, without its type (the outline shows the type as a badge). */
export function conditionLabel(node) {
    switch (node.type) {
        case 'root':
            return 'All requests';
        case 'country': {
            const shown = node.countries.slice(0, 4).join(', ');
            const more = node.countries.length > 4 ? ` +${node.countries.length - 4}` : '';
            return `${shown || '(no country yet)'}${more}`;
        }
        case 'path':
            return `${node.prefix}*`;
        case 'header':
            return `${node.name || '(no header name)'} ${node.operator}${node.operator === 'exists' ? '' : ` "${node.value}"`}`;
        case 'device':
            return node.device;
        default:
            return node.type;
    }
}

export function actionLabel(action) {
    switch (action.kind) {
        case 'origin':
            return `origin ${action.host || '?'}`;
        case 'redirect':
            return `redirect ${action.status} ${action.url}`;
        case 'rewrite':
            return `rewrite to ${action.path}`;
        case 'respond':
            return `respond ${action.status}`;
        default:
            return action.kind;
    }
}
