# config-builder-example — Edge request router

## What it is

The G-Core reference for a wizard that builds **one complex JSON config** and saves it in **one env var** on **one app**.
The topic is an edge request router: a tree of conditions (country, path prefix, header, device) where every branch ends in an action
(send to an origin, redirect, rewrite the path, respond directly). Copy its shape for any "recursive tree of typed nodes →
one JSON value" wizard: the config format, the editor, the field map and Re-entry are all here.

The template's app is an echo app: it returns its `ROUTER_CONFIG`, so you can inspect what was deployed. A real router binary is out of scope.

## How the wizard binds to the app (start here)

All of it is in **`src/deployment.js`**. The wizard edits two values, and each lives in one place in the deployment:

| Deployment (what the host stores) | Wizard form |
|---|---|
| `fastedgeApps[ref 'main'].name` | `name` (locked in Re-entry) |
| `fastedgeApps[ref 'main'].env.ROUTER_CONFIG` | `config` (JSON string ↔ the routing tree) |

The UI (`main.jsx`) makes two calls:

```js
const { name, config, error } = loadForm(current);           // current = deployment.current(), or null in template mode
const params = toDeployPlan({ name, config }, { current, templateId });
await session.deployment.deploy(params, { onPlan, onProgress });
```

- `loadForm(null)` starts an empty tree. `loadForm(current)` runs `fields.load` to turn the env string back into the tree; `error` carries the raw value if it can't.
- `toDeployPlan` runs `fields.save` into a fresh `skeleton` (template mode: the host creates the app) or into `current`
  (Re-entry: the host updates it, checked against `current.revision`). Other env keys on the app pass through unchanged.
- `fields` declares the binding once: `field.env('main', 'ROUTER_CONFIG', { codec: field.json({ parse: upgrade, validate }) })`.

## Tech stack & layout

React 19 + `@gcore/wizard-step-kit/react`, bundled by esbuild; the SDK is bundled in.

```
wizards/gcore/config-builder-example/
  src/
    deployment.js      ← how the form binds to the app: field map, loadForm, toDeployPlan (read first)
    config.js          ← the config format: schemaVersion upgrade, validation, tree edits, outline labels
    *.test.js          ← node:test (`pnpm test`)
    tree.jsx           ← the Routes step: Outline (one line per rule) + RuleEditor (the selected rule)
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
- UI-only state (the selected rule) is never saved, so the config holds only what the app needs.

## Editor layout

Routing products (Akamai Property Manager's rule tree, Cloudflare's "If… Then…" rules, LaunchDarkly's ordered targeting with a default rule)
show rules as a list and open one rule's form at a time, never forms nested in forms. This wizard does the same:

- **Tree** (left): one card per rule — order number, type badge, what it matches, and `→ outcome` on a leaf. Elbow
  connectors show nesting. Each level ends with **+ Add rule…** (a sibling at that level) and a dashed **Otherwise →** card
  (that level's fallback; selecting it edits the parent). Rules with errors say "needs fixing".
- **Order decides the winner.** Rules at one level are checked 1, 2, 3… and the first match wins, so a more specific rule
  must come before a broader one. Each rule's card has ⬆️ ⬇️ (reorder among its siblings, `moveRule` in `config.js`) and ❌ (remove it and everything inside it).
- **Rule editor** (right): the selected rule only — its position ("Rule 2 of 3 under All requests"), then
  **When** (its condition), **Then** (its action), and **+ Add a rule inside this one** to nest. The panes stack below 56rem.
- **Page width:** the wizard sets `:root { --gc-wizard-max-width: 1280px; }` (the portal base caps pages at 900px by default).
- **Review** shows the same outline read-only, with the JSON in a collapsed `<details>`.

## `schemaVersion` and Re-entry errors

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
