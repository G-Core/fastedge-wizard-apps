# config-builder-example — Edge request router

## What it is

The G-Core reference for a wizard that builds **one complex JSON config** and saves it in **one env var** on **one app**.
The topic is an edge request router: a tree of conditions (country, path prefix, header, device) where every branch ends in an action
(send to an origin, redirect, rewrite the path, respond directly). Copy its shape for any "recursive tree of typed nodes →
one JSON value" wizard: the config format, the editor, the field map and Re-entry are all here.

The template's app is an echo app: it returns its `ROUTER_CONFIG`, so you can inspect what was deployed. A real router binary is out of scope.

## Tech stack & layout

React 19 + `@gcore/wizard-step-kit/react`, bundled by esbuild; the SDK is bundled in.

```
wizards/gcore/config-builder-example/
  src/
    config.js          ← the config format: schemaVersion upgrade, validation, tree edits, field map, plan
    config.test.js     ← node:test (`pnpm test`)
    tree.jsx           ← the recursive tree editor (presentational)
    main.jsx           ← boot (template mode vs Re-entry), steps, deploy
    data/countries.js  ← bundled ISO 3166-1 list (249 codes)
  fixtures/
    fastedge/templates.json        ← the launch template (id 1)
    deployment/current.json        ← a deployed router, for ?mode=reentry
```

## Config format (`ROUTER_CONFIG`, schemaVersion 1)

```jsonc
{ "schemaVersion": 1,
  "root": { "type": "root", "action": { "kind": "origin", "host": "www.example.com" },
            "children": [ { "type": "country", "countries": ["FR"], "children": [...], "action": {...} } ] } }
```

| Node | Fields | May contain |
|---|---|---|
| `root` (All requests) | — | country, path, header, device |
| `country` | `countries: string[]` (ISO alpha-2) | path, header, device |
| `path` | `prefix` (starts with `/`) | header, device |
| `header` | `name`, `operator` (`equals`/`contains`/`exists`), `value` | device |
| `device` | `device` (`mobile`/`desktop`/`bot`) | — |

The first matching child wins, top to bottom. An inner node's `action` is its fallback when no child matches, and a leaf must have one.
- **Actions:** `origin {host}`, `redirect {status: 301|302|307, url: https://…}`, `rewrite {path}`, `respond {status, body ≤ 256}`. Each can have optional `headers: [{name, value}]`.
- **Validation** (errors appear on the node and block Next): every leaf has an action, paths start with `/`, redirect URLs are absolute `https`, statuses are in range, no empty country list, a nesting rule is broken, or two siblings have duplicate conditions.
- UI-only state (selection, expanded nodes) is never saved, so the config holds only what the app needs.

## Field map, `schemaVersion` and Re-entry

```js
field.env('main', 'ROUTER_CONFIG', { codec: field.json({ parse: upgrade, validate }) })
```

- **Template mode:** `fields.save({ config }, skeleton({ name, templateId }))` creates the app with the compact JSON.
- **Re-entry:** `fields.load(deployment.current())` gives the tree; Deploy → `fields.save` into the live state, plus the `revision`.
  Other env keys on the app (hand edits) are sent back unchanged. The app name is locked.
- **`upgrade` (the `parse` step):**
  - v1 passes through;
  - v0, the pre-release flat `{ routes: [{ pathPrefix, origin }], defaultOrigin }`, upgrades to path nodes;
  - any other version → the field reports `invalid` with the raw value. The Overview shows the raw value and a **Start from an empty config** reset. Nothing is written until the user deploys.
- **`validate`** runs before every encode, so an invalid tree can never be saved.

## Size limits

| Limit | Value | Effect |
|---|---|---|
| Wizard → host message, `deployment.plan` (the host's `MAX_CONFIG_MESSAGE_BYTES`) | **1 MB per message** | the whole plan (every app's env) must fit. Over it the host replies `invalid_params` at once. The wizard warns at 768 KB of config and blocks above 960 KB. Replies from the host (`deployment.current()`) are not capped |
| Runtime env read (`std::env::var` / `getEnv`) | 64 KB per variable | the wizard shows a note above 64 KB: the app must use the dictionary API |
| Dictionary API (`fastedge::dictionary::get`, `getDictionary`) | no per-variable limit | how the app should read a large config |

The platform API's own maximum for an env value is not documented. Check it on preprod before relying on values near 1 MB.

## Notes for wizards built on this

- **Bundle reference data. Never fetch it at runtime.** The proxy enforces `connect-src 'none'`. The country list is a module generated once (Node `Intl.DisplayNames`, Unicode CLDR names, Unicode License v3). Check the licence of any data you bundle.
- **Read the config with the dictionary API** in the app (`dictionary::get`), not `std::env`, so a config that grows past 64 KB still loads.
- **Version the format from day one** (`schemaVersion`) and keep the upgrade path in `parse`. A deployed config outlives the wizard version that wrote it.
- **Validate in the wizard and in the app.** The wizard blocks bad trees, but the app must still fail safe on a value edited by hand.
- **Keep it under the bridge cap.** The 1 MB budget is for the whole plan message, not just your env value.

## Build, dev, test

```bash
cd wizards/gcore/config-builder-example
pnpm install && pnpm test
pnpm run dev            # mock host on http://localhost:9999
# ?mode=reentry → loads fixtures/deployment/current.json (or your last template-mode deploy in this tab); ?reset clears it
```

The repo-root Playwright suite screenshots the Overview step in template mode and in Re-entry (`OVERRIDES` / `REENTRY` in `e2e/theme.spec.ts`) and runs axe.

## SDK version

Tracks `"latest"`. It needs an SDK release that has the field map (`defineFieldMap`, `field.json`). Until that's published,
build against a local SDK checkout: symlink `node_modules/@gcoredev/fastedge-wizard-sdk` to it. `pnpm install` resets the symlink.
