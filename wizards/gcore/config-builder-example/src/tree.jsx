// The Routes step's two panes. Presentational:
//   field edits go up as onEdit(path, node => node);
//   add / move / remove go up as apply(config => ({ config, path })), and `path` becomes the selection.
//   Outline     — the whole tree: one card per rule, numbered in the order rules are checked
//   RuleEditor  — the form for the one selected rule: When (its condition) / Then (its action)
import { useState } from 'react';

import {
    ACTION_KINDS,
    ALLOWED_CHILDREN,
    DEVICES,
    HEADER_OPERATORS,
    MAX_BODY,
    NODE_TYPES,
    REDIRECT_STATUSES,
    actionLabel,
    addRule,
    conditionLabel,
    moveRule,
    newAction,
    nodeAt,
    parentPath,
    removeRule,
    childPath,
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

// Emoji, with U+FE0F so every platform draws them as emoji rather than as a thin text glyph.
const ICONS = { up: '⬆\ufe0f', down: '⬇\ufe0f', remove: '❌\ufe0f' };

/** A quiet icon-only button. `label` is what a screen reader announces (and the tooltip). */
function IconButton({ icon, label, small, ...rest }) {
    return (
        <button type="button" className={`cb-icon${small ? ' cb-icon--small' : ''}`} aria-label={label} title={label} {...rest}>
            {ICONS[icon]}
        </button>
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
                        <IconButton icon="remove" small label={`Remove ${code}`}
                            onClick={() => onChange(selected.filter((c) => c !== code))} />
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
                    <IconButton icon="remove" label={`Remove header ${h.name || i + 1}`}
                        onClick={() => onChange(headers.filter((_, j) => j !== i))} />
                </div>
            ))}
            <button type="button" onClick={() => onChange([...headers, { name: '', value: '' }])}>Add a response header</button>
        </div>
    );
}

function Action({ action, isLeaf, onChange }) {
    const kinds = Object.entries(ACTION_KINDS);
    // No action yet: say so, rather than showing the first kind as if it were chosen.
    const options = [['', isLeaf ? 'Choose an action…' : 'None'], ...kinds];
    const set = (patch) => onChange({ ...action, ...patch });

    return (
        <div className="cb-action">
            <Select label={isLeaf ? 'Action' : 'Fallback (when no rule inside matches)'}
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

function AddRule({ node, path, apply, label = '+ Add rule' }) {
    const allowed = ALLOWED_CHILDREN[node.type];
    if (!allowed.length) return null;
    return (
        <select className="cb-add" value="" aria-label={`Add a rule under ${conditionLabel(node)}`}
            onChange={(e) => e.target.value && apply((c) => addRule(c, path, e.target.value))}>
            <option value="">{label}…</option>
            {allowed.map((t) => <option key={t} value={t}>{NODE_TYPES[t].label}</option>)}
        </select>
    );
}

// A card is a select button plus, beside it, its own action buttons (a button can't contain buttons).
function Card({ onSelect, current, className = '', tools, children }) {
    return (
        <div className={`cb-rule ${current ? 'cb-rule--current' : ''} ${className}`}>
            {onSelect ? (
                <button type="button" className="cb-rule__body" aria-current={current || undefined} onClick={onSelect}>{children}</button>
            ) : (
                <div className="cb-rule__body">{children}</div>
            )}
            {tools && <span className="cb-rule__tools">{tools}</span>}
        </div>
    );
}

/** ↑ ↓ × on a rule's card: reorder among its siblings, or remove it (and everything inside it). */
function RuleTools({ path, index, count, label, apply }) {
    return (
        <>
            <IconButton icon="up" label={`Move ${label} up`} disabled={index === 0}
                onClick={() => apply((c) => moveRule(c, path, -1))} />
            <IconButton icon="down" label={`Move ${label} down`} disabled={index === count - 1}
                onClick={() => apply((c) => moveRule(c, path, 1))} />
            <IconButton icon="remove" label={`Remove ${label}`}
                onClick={() => apply((c) => ({ config: removeRule(c, path), path: parentPath(path) }))} />
        </>
    );
}

function Branch({ node, path, index, count, errors, selected, onSelect, apply }) {
    const isRoot = path === '';
    const hasChildren = node.children.length > 0;
    const select = onSelect && (() => onSelect(path));

    return (
        <li>
            <Card onSelect={select} current={selected === path} className={isRoot ? 'cb-rule--root' : ''}
                tools={!isRoot && apply && (
                    <RuleTools path={path} index={index} count={count} apply={apply}
                        label={`rule ${index + 1} (${NODE_TYPES[node.type].label} ${conditionLabel(node)})`} />
                )}>
                {index !== undefined && <span className="cb-rule__num">{index + 1}</span>}
                <span className="cb-badge">{isRoot ? 'Start' : NODE_TYPES[node.type].label}</span>
                <span className="cb-rule__match">{conditionLabel(node)}</span>
                {!hasChildren && node.action && <span className="cb-rule__then">→ {actionLabel(node.action)}</span>}
                {errors[path] && <span className="cb-rule__err">needs fixing</span>}
            </Card>
            {(hasChildren || (isRoot && apply)) && (
                <ul>
                    {node.children.map((child, i) => (
                        <Branch key={childPath(path, i)} node={child} path={childPath(path, i)} index={i}
                            count={node.children.length} errors={errors} selected={selected} onSelect={onSelect} apply={apply} />
                    ))}
                    {apply && ALLOWED_CHILDREN[node.type].length > 0 && (
                        <li><AddRule node={node} path={path} apply={apply} /></li>
                    )}
                    {hasChildren && (
                        <li>
                            <Card onSelect={select} className="cb-rule--otherwise">
                                <span className="cb-badge">Otherwise</span>
                                <span className="cb-rule__then">
                                    → {node.action ? actionLabel(node.action) : 'no fallback'}
                                </span>
                            </Card>
                        </li>
                    )}
                </ul>
            )}
        </li>
    );
}

/** The tree. Without onSelect/apply it's read-only (the Review step). */
export function Outline({ config, errors = {}, selected, onSelect, apply }) {
    return (
        <ul className="cb-outline" aria-label="Routing rules">
            <Branch node={config.root} path="" errors={errors} selected={selected} onSelect={onSelect} apply={apply} />
        </ul>
    );
}

/** The form for the rule at `path`. */
export function RuleEditor({ config, path, errors, onEdit, apply }) {
    const node = nodeAt(config, path);
    const isRoot = path === '';
    const own = errors[path] ?? [];
    const edit = (patch) => onEdit(path, (n) => ({ ...n, ...patch }));
    const parent = isRoot ? null : nodeAt(config, parentPath(path));
    const index = isRoot ? 0 : Number(path.split('.').pop());

    return (
        <section className="cb-editor" aria-label={`Edit rule: ${conditionLabel(node)}`}>
            <span className="cb-badge">{isRoot ? 'Start' : NODE_TYPES[node.type].label}</span>
            <h3>{isRoot ? 'All requests' : `Rule ${index + 1} of ${parent.children.length} under ${conditionLabel(parent)}`}</h3>
            <p className="cb-lede">
                {isRoot
                    ? 'Every request starts here. The rules under it are checked top to bottom; the first that matches wins.'
                    : 'Rules at the same level are checked top to bottom; the first that matches wins. Use ⬆️ ⬇️ on the card to reorder, ❌️ to remove.'}
            </p>
            {own.length > 0 && (
                <ul className="cb-errors">
                    {own.map((e) => <li key={e}>{e}</li>)}
                </ul>
            )}
            <h4>When</h4>
            {isRoot ? <p className="cb-lede">Any request.</p> : <Condition node={node} edit={edit} />}
            <h4>Then</h4>
            <Action action={node.action} isLeaf={!node.children.length}
                onChange={(action) => onEdit(path, (n) => {
                    const { action: _old, ...rest } = n;
                    return action ? { ...rest, action } : rest;
                })} />
            {ALLOWED_CHILDREN[node.type].length > 0 && (
                <>
                    <h4>{isRoot ? 'Rules' : 'Narrow it further'}</h4>
                    <AddRule node={node} path={path} apply={apply} label="+ Add a rule inside this one" />
                </>
            )}
        </section>
    );
}
