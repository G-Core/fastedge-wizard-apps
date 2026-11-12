// ═══ How this wizard binds to the app — read this file first ═══════════════════════════════════
//
// The wizard edits two values. Each one lives in exactly one place in the deployment:
//
//   deployment (what the host stores)                   wizard form
//   ─────────────────────────────────                   ───────────
//   fastedgeApps[ref 'main'].name                  ↔    name    (locked in Re-entry)
//   fastedgeApps[ref 'main'].env.ROUTER_CONFIG     ↔    config  (JSON string ↔ the routing tree)
//
// `fields` (an SDK field map) declares the ROUTER_CONFIG binding once, and the SDK runs it both ways:
//   fields.load(state)         → { values: { config }, errors: { config? } }   string → tree
//   fields.save(values, state) → a copy of state with ROUTER_CONFIG written     tree → string
// Every other env key on the app (e.g. one added by hand in the portal) is carried through unchanged.
//
// main.jsx calls only the two functions at the bottom:
//   loadForm(current)             start the form: an empty tree (template mode) or the live one (Re-entry)
//   lockedFields(current)         what the form must lock in Re-entry, with the reason to show
//   toDeployPlan(form, context)   turn the form into deployment.deploy() params
//
// Everything about the tree itself (format, validation, editing) is in config.js.
import { defineFieldMap, field } from '@gcoredev/fastedge-wizard-sdk';

import { emptyConfig, upgrade, validate } from './config.js';

/** The app's Ref in the plan, and the env var that holds the config. */
export const APP_REF = 'main';
export const ENV_KEY = 'ROUTER_CONFIG';

export const fields = defineFieldMap({
    config: field.env(APP_REF, ENV_KEY, {
        // The env value is a string; field.json parses/stringifies it. `parse` also upgrades an older
        // schemaVersion, and walks the tree once so a malformed one (a null child, an unknown node
        // type) is a load error, not a crash while rendering. `validate` runs before every save, so
        // an invalid tree is never written.
        codec: field.json({
            parse: (raw) => {
                const config = upgrade(raw);
                validate(config); // throws on a malformed tree; rule errors are left for the form
                return config;
            },
            validate: (config) => {
                if (Object.keys(validate(config)).length) throw new Error('the config has validation errors');
            },
        }),
    }),
});

/** Template mode has no deployment yet: this is the one app to create, with an empty env for the field map to fill. */
export const skeleton = ({ name, templateId }) => ({
    fastedgeApps: [{ ref: APP_REF, name, api_type: 'wasi-http', source: { fromTemplateId: templateId }, env: {} }],
});

/** The deploy params for a state: the apps, plus in Re-entry the revision that was read (the host refuses a stale one). */
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

// ═══ The two calls the UI makes ═══════════════════════════════════════════════════════════════

/**
 * The form's starting values. `current` is deployment.current() in Re-entry, null in template mode.
 * `error` is set when the deployed ROUTER_CONFIG can't be read (missing, broken JSON, unknown
 * schemaVersion); it carries the raw value so the UI can show it and offer a reset.
 */
export function loadForm(current) {
    if (!current) return { name: 'router', config: emptyConfig(), error: null };

    const { values, errors } = fields.load(current);
    return {
        name: current.fastedgeApps.find((a) => a.ref === APP_REF)?.name ?? '',
        config: values.config ?? emptyConfig(),
        error: errors.config ?? null,
    };
}

/**
 * What the form must lock in Re-entry, with the reason to show (`{}` in template mode). The host
 * refuses to rename a deployed app; `fields.locks()` adds any field marked `field.fixed` (none here —
 * the whole config stays editable).
 */
export function lockedFields(current) {
    if (!current) return {};
    return { name: 'Fixed after the first deploy — the portal keeps the app name.', ...fields.locks(current) };
}

/**
 * deployment.deploy() params for the form.
 *   template mode: save into a fresh skeleton   → the host creates the app
 *   Re-entry:      save into the live state     → the host updates it (desired state + revision)
 */
export function toDeployPlan({ name, config }, { current, templateId }) {
    const base = current ?? skeleton({ name, templateId });
    return toPlan(fields.save({ config }, base), current?.revision);
}
