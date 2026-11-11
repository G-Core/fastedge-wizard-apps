// The recursive route editor. Presentational: every edit goes up as onEdit(path, node => node).
import { useState } from 'react';

import {
    ACTION_KINDS,
    ALLOWED_CHILDREN,
    DEVICES,
    HEADER_OPERATORS,
    MAX_BODY,
    NODE_TYPES,
    REDIRECT_STATUSES,
    newAction,
    newNode,
} from './config.js';
import { COUNTRIES } from './data/countries.js';

const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));

function Input({ label, value, onChange, ...rest }) {
    return (
        <label className="cb-field">
            <span>{label}</span>
            <input type="text" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
        </label>
    );
}

function Select({ label, value, onChange, options }) {
    return (
        <label className="cb-field">
            <span>{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map(([v, text]) => (
                    <option key={v} value={v}>{text}</option>
                ))}
            </select>
        </label>
    );
}

/** Searchable multi-select over the bundled country list. */
function CountryPicker({ selected, onChange }) {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const matches = q
        ? COUNTRIES.filter(
              (c) => !selected.includes(c.code) && (c.code.toLowerCase() === q || c.name.toLowerCase().includes(q)),
          ).slice(0, 8)
        : [];

    return (
        <div>
            <div className="cb-chips" aria-label="Selected countries">
                {selected.map((code) => (
                    <span key={code} className="cb-chip">
                        {COUNTRY_NAME.get(code) ?? code} ({code})
                        <button type="button" aria-label={`Remove ${code}`}
                            onClick={() => onChange(selected.filter((c) => c !== code))}>×</button>
                    </span>
                ))}
            </div>
            <Input label="Add a country" value={query} onChange={setQuery} placeholder="Search by name or code" />
            {matches.length > 0 && (
                <div className="cb-matches">
                    {matches.map((c) => (
                        <button key={c.code} type="button" onClick={() => {
                            onChange([...selected, c.code]);
                            setQuery('');
                        }}>{c.name} ({c.code})</button>
                    ))}
                </div>
            )}
        </div>
    );
}

function Condition({ node, edit }) {
    switch (node.type) {
        case 'country':
            return <CountryPicker selected={node.countries} onChange={(countries) => edit({ countries })} />;
        case 'path':
            return <Input label="Path prefix" value={node.prefix} onChange={(prefix) => edit({ prefix })} placeholder="/shop" />;
        case 'header':
            return (
                <div className="cb-row">
                    <Input label="Header name" value={node.name} onChange={(name) => edit({ name })} placeholder="X-Customer-Tier" />
                    <Select label="Operator" value={node.operator} onChange={(operator) => edit({ operator })}
                        options={HEADER_OPERATORS.map((o) => [o, o])} />
                    {node.operator !== 'exists' && (
                        <Input label="Value" value={node.value} onChange={(value) => edit({ value })} />
                    )}
                </div>
            );
        case 'device':
            return <Select label="Device" value={node.device} onChange={(device) => edit({ device })}
                options={DEVICES.map((d) => [d, d])} />;
        default:
            return null;
    }
}

function Headers({ headers = [], onChange }) {
    const set = (i, patch) => onChange(headers.map((h, j) => (j === i ? { ...h, ...patch } : h)));
    return (
        <div>
            {headers.map((h, i) => (
                <div key={i} className="cb-row">
                    <Input label="Response header" value={h.name} onChange={(name) => set(i, { name })} />
                    <Input label="Value" value={h.value} onChange={(value) => set(i, { value })} />
                    <button type="button" onClick={() => onChange(headers.filter((_, j) => j !== i))}>Remove</button>
                </div>
            ))}
            <button type="button" onClick={() => onChange([...headers, { name: '', value: '' }])}>Add a response header</button>
        </div>
    );
}

function Action({ action, isLeaf, onChange }) {
    const kinds = Object.entries(ACTION_KINDS);
    const options = isLeaf ? kinds : [['', 'None — only the conditions below'], ...kinds];
    const set = (patch) => onChange({ ...action, ...patch });

    return (
        <div className="cb-action">
            <Select label={isLeaf ? 'Action' : 'Fallback action (when no condition below matches)'}
                value={action?.kind ?? ''} options={options}
                onChange={(kind) => onChange(kind ? newAction(kind) : undefined)} />
            {action?.kind === 'origin' && (
                <Input label="Origin hostname" value={action.host} onChange={(host) => set({ host })} placeholder="api.example.com" />
            )}
            {action?.kind === 'redirect' && (
                <div className="cb-row">
                    <Select label="Status" value={String(action.status)} onChange={(s) => set({ status: Number(s) })}
                        options={REDIRECT_STATUSES.map((s) => [String(s), String(s)])} />
                    <Input label="Redirect to" value={action.url} onChange={(url) => set({ url })} />
                </div>
            )}
            {action?.kind === 'rewrite' && (
                <Input label="Rewrite path to" value={action.path} onChange={(path) => set({ path })} />
            )}
            {action?.kind === 'respond' && (
                <div className="cb-row">
                    <Input label="Status" value={String(action.status)} inputMode="numeric"
                        onChange={(s) => set({ status: Number(s) })} />
                    <Input label={`Body (max ${MAX_BODY} characters)`} value={action.body} onChange={(body) => set({ body })} />
                </div>
            )}
            {action && <Headers headers={action.headers} onChange={(headers) => set({ headers: headers.length ? headers : undefined })} />}
        </div>
    );
}

export function NodeEditor({ node, path, errors, onEdit, onRemove }) {
    const own = errors[path] ?? [];
    const edit = (patch) => onEdit(path, (n) => ({ ...n, ...patch }));
    const allowed = ALLOWED_CHILDREN[node.type];
    const childPath = (i) => (path === '' ? String(i) : `${path}.${i}`);

    return (
        <section className={`cb-node${own.length ? ' cb-node--error' : ''}`} aria-label={NODE_TYPES[node.type].label}>
            <div className="cb-node__head">
                <span className="cb-node__title">{NODE_TYPES[node.type].label}</span>
                {onRemove && <button type="button" onClick={onRemove}>Remove</button>}
            </div>
            <Condition node={node} edit={edit} />
            <Action action={node.action} isLeaf={!node.children.length}
                onChange={(action) => onEdit(path, (n) => {
                    const { action: _old, ...rest } = n;
                    return action ? { ...rest, action } : rest;
                })} />
            {own.length > 0 && (
                <ul className="cb-errors">
                    {own.map((e) => <li key={e}>{e}</li>)}
                </ul>
            )}
            {(node.children.length > 0 || allowed.length > 0) && (
                <div className="cb-children">
                    {node.children.map((child, i) => (
                        <NodeEditor key={childPath(i)} node={child} path={childPath(i)} errors={errors} onEdit={onEdit}
                            onRemove={() => onEdit(path, (n) => ({ ...n, children: n.children.filter((_, j) => j !== i) }))} />
                    ))}
                    {allowed.length > 0 && (
                        <Select label="Add a condition" value=""
                            options={[['', 'Choose a type…'], ...allowed.map((t) => [t, NODE_TYPES[t].label])]}
                            onChange={(type) => type && onEdit(path, (n) => ({ ...n, children: [...n.children, newNode(type)] }))} />
                    )}
                </div>
            )}
        </section>
    );
}
