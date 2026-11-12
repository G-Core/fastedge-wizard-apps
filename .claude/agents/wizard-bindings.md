---
name: wizard-bindings
description: Write a wizard's src/deployment.js — the SDK field map that says where every form value lives in the deployment — plus its tests and a Re-entry fixture, from the Bindings table in TARGET.md. Run after /wizard-intake, before building the wizard's steps. One map drives both first deploy (template mode) and editing a deployed setup (Re-entry).
---

Bind a wizard's form to its deployment, once, so the same code creates it and edits it.

## When to use

Run after `/wizard-intake` has written `wizards/<name>/TARGET.md`, and before
building the wizard's UI steps. Re-run it when a template gains or loses a param,
or when a value moves between apps.

Without a field map a wizard can only create. With one, the same declarations
load the form from a live deployment (`deployment.current()`) and write it back
as a desired-state plan, so the wizard can be opted in to Re-entry
(`/wizard-publish` asks).

**Reference wizards** — read the one closest to the target before writing:

| Wizard | Shows |
|--------|-------|
| `wizards/gcore/config-builder-example/src/deployment.js` | The minimum: one app, one JSON env value (`field.json` with a schema upgrade), app name locked. Start here. |
| `wizards/gcore/edge-totp/src/deployment.js` | Two apps sharing values, secrets, a store, a keypair, `field.custom` for CDN rules and env groups, fixed fields, keeping an unreadable value. |

The SDK contract is `docs/runtime-rules.md` ("Template mode and re-entry",
"Locked fields in re-entry") in `@gcoredev/fastedge-wizard-sdk`, and the types
in its `src/field-map.ts`.

## Args

`[wizard-name]` — optional; confirm interactively if not supplied.

## Steps

### 0 — Confirm before doing anything

Ask the user in a single message:

1. **Wizard**: which wizard under `wizards/` (any directory at any depth with its
   own `package.json`, skip `_template*`).
2. **The Bindings table**: read `wizards/<name>/TARGET.md`. If it has a
   `## Bindings` section, show it and ask the user to confirm or correct it. If
   it doesn't, draft one from the param tables and cross-app constraints (same
   columns as `/wizard-intake` writes), show it, and get it confirmed. Every
   **Fixed** row needs a reason the user will read — ask for one rather than
   inventing it.
3. **Existing code**: if `src/deployment.js` already exists, say so and ask
   whether to extend it or replace it. Never overwrite silently.

Do not proceed until the wizard and the Bindings table are confirmed.

### 1 — Choose app Refs

One Ref per app the wizard deploys: short, lower-case, stable (`main`,
`filter`, `app`). List the app made from the **launch template first** — the
first app in the plan is the deployment's anchor, and the anchor can never be
removed on Re-entry.

A Ref is permanent. The portal maps Refs to app ids; on Re-entry a Ref it
doesn't know is a new app, and a missing one must be listed in
`remove.fastedgeApps` or the plan is refused. Renaming a Ref after release
duplicates the app.

### 2 — Pick a field kind for each row

| The value is… | Use |
|---------------|-----|
| A plain env string | `field.env(ref, 'KEY')` |
| An env value that is JSON / a number / a list | `field.env(ref, 'KEY', { codec })` — `field.json({ parse, validate })` for JSON (`parse` upgrades an old `schemaVersion`, `validate` runs before every save) or `{ decode, encode }` |
| Optional, with a default the app applies itself | add `default: …, omitIfDefault: true` — saving the default deletes the key |
| The same value on several apps | pass an array of Refs: `field.env(['filter', 'app'], 'KEY')`. Load reports `diverged` if the copies disagree; save writes every copy |
| A secret the user picks or the wizard generates | `field.secret(refOrRefs, 'BINDING')` — value `{ id, name }` from `secrets.pickOrCreate()` |
| A KV store | `field.store(refOrRefs, 'BINDING')` — value `{ id, name }` from `stores.pickOrCreate()` |
| An ES256 keypair (private in a secret, public JWK in env) | `field.keypair(ref, 'SECRET_BINDING', 'PUBLIC_JWK_KEY')` |
| One value stored in several shapes, a group of keys behind one toggle, or CDN rules/origins | `field.custom({ writes, load, save })` — `writes` must list every destination it changes (`{app, env}`, `{app, secret}`, `{app, store}`, `{cdnRules: 'prefix'}`); `save` changing anything else throws |
| Can't change once deployed | wrap it: `field.fixed('Reason the user reads.', field.…)` |

In a custom `load`, throw `fieldError('missing' | 'diverged', message)` for
those cases; any other throw is reported as `invalid`.

Never map:
- **`WIZARD_*` env keys** — the portal owns them and strips them from every plan.
- **The app name, its template/binary, the CDN resource** — the portal refuses
  to change them on Re-entry. Lock them in the UI via `lockedFields` (step 3),
  not the map.

### 3 — Write `src/deployment.js`

Follow config-builder's layout: a header comment with the binding table (what
the host stores ↔ which form field), then the code, then the functions the UI
calls at the bottom. Export:

- `fields` — `defineFieldMap({ … })` from step 2. It throws as soon as the module
  loads if two fields write the same place — fix the table, don't work around it.
- `skeleton({ name, …templates })` — the template-mode starting state: every app
  with `ref`, `name`, `api_type`, `source: { fromTemplateId }` and an empty
  `env`. Template ids come from `context.get()` (`launchTemplateId`,
  `companionTemplateIds`, matched by `api_type`) — never hard-coded.
- `loadForm(current)` — template mode (`current === null`): the form defaults.
  Re-entry: `fields.load(current)` → form values plus per-field `errors`.
- `lockedFields(current)` — `{}` in template mode; in Re-entry the host-fixed
  name (and CDN resource, if any) with reasons, merged with
  `fields.locks(current)`.
- `toDeployPlan(form, { current, … })` — `fields.save(values, current ?? skeleton(…))`,
  then the plan: template mode creates (`newCdnOrigins` / `newCdnRules`);
  Re-entry sends the full desired state (`cdnOrigins` / `cdnRules`) plus
  `revision: current.revision`.

**A field that couldn't be loaded** (in `errors`) shows a default in the form.
Unless the user changed it, leave it out of the values passed to `save`, so the
deployed value is kept rather than overwritten with the default (edge-totp's
`reentryValues`). Show the error and let the user fix it — a fixed field that
didn't load is deliberately writable, so this is how the user repairs it.

### 4 — Write `src/deployment.test.js`

`node:test`, run by the wizard's `test` script (`node --test src/*.test.js`).
At minimum:

1. **Template mode**: a filled form saves into the skeleton and gives the
   expected apps/env/secretRefs/storeRefs (and CDN rules if any).
2. **Round trip**: load the fixture from step 5, save the loaded values back —
   the state is unchanged.
3. **Unmanaged keys survive**: add an env key the map doesn't know to the
   fixture; it is still there after a save.
4. **Locks**: `lockedFields(current)` lists every Fixed row with its reason;
   `fields.save` with a changed fixed value throws `invalid_params`;
   `lockedFields(null)` is `{}`.
5. **Re-entry plan**: carries `revision` and the desired-state CDN keys, not the
   `new*` ones.
6. One test per `field.custom`: a broken or hand-edited deployed value loads as
   an error rather than being silently normalised.

### 5 — Write `fixtures/deployment/current.json`

The state the mock host serves on Re-entry (`pnpm run dev`, then open with
`?mode=reentry`). Build it by saving a realistic filled form into the skeleton,
then add `"revision": "1"` and the `secrets` / `stores` name arrays
(`[{ id, name }]` for every id referenced). Use small fake ids (1, 2, 3…; CDN
resource 12000001); template ids 1 (launch) and 2–19 (companions) to match the
template fixtures.

For a real deployment's state instead, run `/sync-wizard-fixtures` and pick
"deployment".

Validate with the wizard's installed SDK before writing:
`fixtureSchemas['deployment/current'].parse(state)` from
`node_modules/@gcoredev/fastedge-wizard-sdk/dist/schemas.js`.

### 6 — Wire the UI (tell the user; don't build the steps)

- Show every lock: `ResourceRow locked={locks.x}` for a picked resource,
  `<Locked reason={locks.x}>` around an input plus `disabled={!!locks.x}`
  (both from `@gcore/wizard-step-kit/react`).
- Show each `errors[field]` next to its field, with the raw value where
  there is one (`error.raw`), and a way to reset.
- In Re-entry, title the first step as editing and say what is fixed.

### 7 — Verify and report

Run the wizard's `pnpm test` and `pnpm run build`. Report:

- The Refs chosen and which app is the anchor
- Each binding → field kind, and which are fixed (with reasons)
- Files written (`src/deployment.js`, `src/deployment.test.js`,
  `fixtures/deployment/current.json`) and the test result
- Next steps: build the steps against `loadForm` / `lockedFields` /
  `toDeployPlan`; check Re-entry in the mock host (`?mode=reentry`); when it
  works, `/wizard-publish` with Re-entry on

## Rules

- One place per value. If two fields seem to write the same key, it is one
  field bound to several Refs, or one `field.custom`.
- Keys the map doesn't own must pass through a save untouched — never build
  `env` from scratch in a custom `save`; copy and change.
- Never normalise in `load`. A deployed value the wizard can't parse is an
  error to show, not something to rewrite silently on the next save.
- Pick or create a secret/store through the SDK before referencing its id — an
  id the user didn't pick is `out_of_scope`.
- Re-entry plans are refused if the deployment changed since `current()` was
  read (stale `revision`) — reload, don't retry blindly.
