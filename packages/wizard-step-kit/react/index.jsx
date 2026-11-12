/**
 * Thin React 19 wrappers for gc-wizard-shell and gc-optional-panels.
 * Encapsulates ref + addEventListener so consumers use idiomatic React props.
 *
 * Import:  import { WizardShell, WizardStep, OptionalPanels, WizardPanel }
 *            from '@gcore/wizard-step-kit/react';
 *
 * The custom elements must be registered first:
 *   import '@gcore/wizard-step-kit'; // side-effect import registers them
 */
import { useEffect, useRef, createElement as h } from 'react';

/**
 * @param {{ canAdvance?: boolean, finished?: boolean, error?: string,
 *           labels?: { back?: string, next?: string, finish?: string, finished?: string },
 *           onNavigate?: (e: CustomEvent) => void,
 *           onNavigated?: (e: CustomEvent) => void,
 *           onFinish?: (e: CustomEvent) => void,
 *           onWizardFinished?: (e: CustomEvent) => void,
 *           children?: React.ReactNode }} props
 */
export function WizardShell({
    canAdvance = false,
    finished = false,
    error,
    labels = {},
    onNavigate,
    onNavigated,
    onFinish,
    onWizardFinished,
    children,
}) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const nav  = e => onNavigate?.(e);
        const navd = e => onNavigated?.(e);
        const fin  = e => onFinish?.(e);
        const wfin = e => onWizardFinished?.(e);
        el.addEventListener('navigate',       nav);
        el.addEventListener('navigated',      navd);
        el.addEventListener('finish',         fin);
        el.addEventListener('wizard-finished', wfin);
        return () => {
            el.removeEventListener('navigate',       nav);
            el.removeEventListener('navigated',      navd);
            el.removeEventListener('finish',         fin);
            el.removeEventListener('wizard-finished', wfin);
        };
    }, [onNavigate, onNavigated, onFinish, onWizardFinished]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.toggleAttribute('can-advance', canAdvance);
    }, [canAdvance]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.toggleAttribute('finished', finished);
    }, [finished]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (error != null) el.setAttribute('error', error);
        else el.removeAttribute('error');
    }, [error]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { back, next, finish, finished: finishedLabel } = labels;
        if (back          != null) el.setAttribute('label-back',     back);
        if (next          != null) el.setAttribute('label-next',     next);
        if (finish        != null) el.setAttribute('label-finish',   finish);
        if (finishedLabel != null) el.setAttribute('label-finished', finishedLabel);
    }, [labels]);

    return h('gc-wizard-shell', { ref }, children);
}

/**
 * @param {{ title: string, children?: React.ReactNode }} props
 */
export function WizardStep({ title, children }) {
    return h('gc-wizard-step', { title }, children);
}

/**
 * @param {{ multiple?: boolean, value?: string[], onChange?: (selected: string[]) => void,
 *           children?: React.ReactNode }} props
 * `value` (optional) controls the selection — pass it to show a preselected panel.
 */
export function OptionalPanels({ multiple = false, value, onChange, children }) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const handler = e => onChange?.(e.detail.selected);
        el.addEventListener('selection-change', handler);
        return () => el.removeEventListener('selection-change', handler);
    }, [onChange]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.toggleAttribute('multiple', multiple);
    }, [multiple]);

    // Joined so a fresh array with the same panels doesn't re-run the effect every render.
    const selected = value?.join('\n');
    useEffect(() => {
        const el = ref.current;
        if (!el || selected === undefined) return;
        el.selected = selected ? selected.split('\n') : [];
    }, [selected, multiple]); // re-apply after `multiple` changes: dropping it collapses the selection

    return h('gc-optional-panels', { ref }, children);
}

/**
 * @param {{ value: string, label: string, children?: React.ReactNode }} props
 */
export function WizardPanel({ value, label, children }) {
    return h('gc-wizard-panel', { value, label }, children);
}

/**
 * @param {{ title: string, sub?: string, value?: string, set?: boolean,
 *           onClear?: (e: CustomEvent) => void,
 *           labels?: { set?: string, unset?: string, clear?: string },
 *           children?: React.ReactNode }} props
 */
/**
 * `locked`: a reason string (e.g. from the SDK field map's `locks()`) locks the row — neutral
 * "🔒 locked" badge, no clear, actions hidden, the reason in place of `sub`. Falsy → not locked.
 */
export function ResourceRow({ title, sub, value, set = false, locked, onClear, labels = {}, children }) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const clear = e => onClear?.(e);
        el.addEventListener('clear', clear);
        return () => el.removeEventListener('clear', clear);
    }, [onClear]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (title != null) el.setAttribute('title', title); else el.removeAttribute('title');
        if (sub   != null) el.setAttribute('sub', sub);      else el.removeAttribute('sub');
        if (value != null) el.setAttribute('value', value);  else el.removeAttribute('value');
    }, [title, sub, value]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.toggleAttribute('set', set);
        el.toggleAttribute('clearable', !!onClear);
        el.toggleAttribute('locked', !!locked);
        if (typeof locked === 'string') el.setAttribute('reason', locked); else el.removeAttribute('reason');
    }, [set, onClear, locked]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { set: ls, unset, clear } = labels;
        if (ls    != null) el.setAttribute('label-set',   ls);
        if (unset != null) el.setAttribute('label-unset', unset);
        if (clear != null) el.setAttribute('label-clear', clear);
    }, [labels]);

    return h('gc-resource-row', { ref }, children);
}

/**
 * Locks the fields inside it and shows "🔒 <reason>" under them. Falsy `reason` → renders the
 * children unchanged, so wrap unconditionally: `<Locked reason={locks.authPrefix}>…</Locked>`.
 * It doesn't disable the fields — pass `disabled={!!reason}` to them yourself.
 */
export function Locked({ reason, children }) {
    return h('gc-locked', reason ? { reason } : {}, children);
}

/**
 * Display-only deploy lifecycle panel. Drive `session.deployment.deploy()`
 * yourself and pass the resulting state; the element renders it.
 *
 * @param {{ state: { status?: string, plan?: object, progress?: object[],
 *           result?: object, error?: string } }} props
 */
export function DeployProgress({ state }) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (el) el.state = state;
    }, [state]);

    return h('gc-deploy-progress', { ref });
}
