# Context Index

> Discovery hub for this repo. Read after `CLAUDE.md`. Jump to the section
> relevant to your task; do not read everything upfront.

## System Overview

FastEdge wizards are interactive setup forms that run inside the Gcore portal
in a hardened iframe. A wizard talks to the portal over a `MessageChannel`
bridge using a narrow intent catalog — the portal calls the Gcore API on the
wizard's behalf. The wizard never holds a credential.

**This repo** hosts the static wizard front-end files. The portal does not
frame them directly — the wizard proxy WASM app fetches them server-side and
re-serves them under a single origin with enforced headers.

Everything a wizard author needs is in this repo's `context/` docs plus the public SDK. The portal host, the proxy app, and the internal design docs are Gcore-maintained and not part of this repo.

### Other system components

| Component | Location |
|-----------|----------|
| Portal host (Angular, bridge, intent router) | Gcore portal (internal) |
| Guest SDK (`@gcoredev/fastedge-wizard-sdk`) | [`G-Core/fastedge-wizard-sdk`](https://github.com/G-Core/fastedge-wizard-sdk) (public) |
| Proxy WASM app (fetches + re-serves wizards under one origin) | Gcore-internal |
| SDK API / migration / consumption guide | `context/` in the public SDK repo |

---

## Proxy URL Contract

The proxy (`WIZARD_ALLOWED_REPOS = ["G-Core/FastEdge-Wizard-apps", ...]`) supports
two CDN backends. Paths with no file extension resolve to `/index.html`.

### jsDelivr — the backend we use

CI publishes built output to the `gh-pages` branch (`.github/workflows/deploy.yml`);
jsDelivr serves it from git. The ref is a **stable branch** (`gh-pages`), not a
per-release tag — so `WIZARD_SOURCE_CONFIG` is set once and never rewritten per
deploy. Note there is **no `release/` prefix**: `peaceiris` publishes the
`release/` dir *as the branch root*, so a wizard sits at `gh-pages/<wizard>`.

```
Proxy path: /jsdelivr/G-Core/FastEdge-Wizard-apps/<ref>/<wizard>/<asset>
                                                    ^ref  ^wizard-subpath
Resolves:   https://cdn.jsdelivr.net/gh/G-Core/FastEdge-Wizard-apps@<ref>/<wizard>/<asset>
```

**Freshness:** jsDelivr caches branch refs for up to 7 days, and nothing else
caches (the WASM proxy runs every request; no edge cache). So each publish
**purges** the changed assets from jsDelivr — that purge is the only thing making
a deploy visible promptly.

### GitHub Pages — not used here

The proxy also has a `/pages/` backend (`<org>.github.io/<repo>/...`), but the
GitHub Pages *feature* is disabled org-wide, so it does not resolve for this
repo. jsDelivr reads the git branch directly and needs no Pages feature.

### Wiring a wizard to the portal

Set on the FastEdge template that launches this wizard — `ref` and `wizardDir`
are explicit, separate fields (not a combined path string), since a git ref may
itself contain a `/` (e.g. a branch like `feat/my-wizard`):

```
WIZARD_SOURCE_CONFIG={"repo":"G-Core/FastEdge-Wizard-apps","ref":"gh-pages","wizardDir":"<wizard-dir>","cdn":"jsdelivr"}
```

The portal reads `WIZARD_SOURCE_CONFIG` and builds the proxy path from `repo` +
`ref` + `wizardDir` + `cdn` — percent-encoding any `/` inside `ref` so it
survives as a single URL path segment; the proxy decodes it back before
validating (see `parseSource` in the proxy app).

`wizardDir` may itself contain `/` — e.g. `"<customer-folder>/<wizard-name>"`
for a customer nesting wizards under a subfolder. No special encoding needed
here: the proxy already treats everything after the ref as the (possibly
multi-segment) wizard path, validating each segment individually.

---

## SDK

| | |
|--|--|
| Package | `@gcoredev/fastedge-wizard-sdk` |
| Repo | `G-Core/fastedge-wizard-sdk` (standalone public repo) |
| Install | `"@gcoredev/fastedge-wizard-sdk": "latest"` in `package.json` (npm) |
| Build | `esbuild src/main.js --bundle --format=esm --outfile=main.js` |
| Why bundled | Proxy enforces `connect-src 'none'` — no runtime CDN fetch allowed |

The SDK ships prebuilt `dist/` in its npm tarball (built in CI before publish);
types are included.

### SDK version log

| Tag / ref | Notes |
|-----------|-------|
| `v0.0.8` | Mock-host + theme/locale bridge shipped (see `decisions.md` §6). Note: the SDK `package.json` `version` field currently reads `0.0.1` and lags the tags — reconcile before the first external tag pin. |
| `main` | Development — do not pin committed wizards to this |

> Wizards depend on the npm package (`"@gcoredev/fastedge-wizard-sdk": "latest"` for starters/examples; a production wizard can pin a published version). A `github:…#<tag>` pin also works.

_Add rows when tags are published._

### Session API (convenience summary)

> **Authoritative source:** `node_modules/@gcoredev/fastedge-wizard-sdk/dist/sdk.d.ts` + `types.d.ts` (source: `G-Core/fastedge-wizard-sdk`, public). The list below is a quick reference; the `.d.ts` files are the source of truth and include parameter shapes this summary omits.

```js
session.context.get()
session.fastedge.templates.list(params?)
session.fastedge.templates.read({ id })
session.fastedge.apps.list()
session.fastedge.apps.get({ id })
session.fastedge.apps.create(params)             // consent required
session.fastedge.apps.update(params)             // consent required
session.fastedge.apps.link(params)               // consent required
session.fastedge.secrets.pickOrCreate(params?)   // portal picker: select existing OR create inline → { id, name, origin }[]. { bytes } arms the create Generate button
session.fastedge.secrets.generateKeypair(params) // portal modal; returns { id, name, publicKey } (ES256 JWK)
session.fastedge.stores.pickOrCreate()           // portal picker: user selects existing OR creates inline → { id, name }[]
session.cdn.resources.list()
session.cdn.resources.pick()                     // opens portal picker
session.cdn.origins.list()
session.cdn.origins.create(params)               // consent required
session.cdn.rules.list({ resourceId })
session.cdn.rules.create(params)                 // consent required
session.deployment.plan(params)                  // dry-run, no consent
session.deployment.apply({ planId })             // consent required
session.deployment.deploy(params, { onPlan, onProgress }) // convenience: plan → apply + progress (edge-totp uses this)
session.on('deployment.progress', handler)
session.dispose()
```

### Mock host

The SDK ships a development server (`bin/dev.mjs`) that acts as a mock portal
host — it serves the wizard inside a real iframe, runs the full bridge protocol,
and responds to intents using data from the wizard's `fixtures/` directory. Each
wizard that has a `fixtures/` dir gets realistic intent responses without hitting
the real API. Run via `pnpm run dev` inside a wizard directory.

Fixture files are namespaced by resource group under `fixtures/`:

```
fixtures/
  fastedge/
    templates.json   # fastedge.templates.*
    apps.json        # fastedge.apps.*
    secrets.json     # fastedge.secrets.*
    stores.json      # fastedge.stores.*
  cdn/
    resources.json   # cdn.resources.*
    origins.json     # cdn.origins.*
    rules.json       # cdn.rules.*
```

**Only `fastedge/templates.json` needs to be provided.** The mock host ships
built-in stub data for every other group (CDN resources, stores, secrets, apps,
origins, rules) — pickers and generate/create stubs work with no fixture files
at all. A group's fixture file overrides the stubs only when it exists and is
non-empty. See `mock-host/stubs.js` in the installed SDK for the defaults.

The mock host validates all fixture files against the SDK's Zod schemas at
startup and warns on any mismatch. Pass `--validate-only` for a CI-safe check.

---

## Token Quick-Reference — `--gc-wizard-*` Subset

Use these purpose-named tokens in wizard CSS. Prefer them over the raw 379-token set.
The full set (all `--gc-*` tokens) is allowed and still linted — but these 11 cover
the common cases and survive reseller theming unchanged.

| Purpose | Token | Maps to |
|---------|-------|---------|
| Body text | `--gc-wizard-text` | `--gc-font-color` |
| Muted / secondary text | `--gc-wizard-text-muted` | `--gc-font-text-secondary-color` |
| Border | `--gc-wizard-border` | `--gc-border-primary-color` |
| Surface / card background | `--gc-wizard-surface` | `--gc-background-secondary-color` |
| Brand / accent | `--gc-wizard-brand` | `--gc-core-brand-color` |
| Text on brand | `--gc-wizard-brand-content` | `--gc-core-brand-content-color` |
| Danger / error | `--gc-wizard-danger` | `--gc-alert-stroke-red-color` |
| Warning | `--gc-wizard-warning` | `--gc-alert-stroke-yellow-color` |
| Success | `--gc-wizard-success` | `--gc-alert-stroke-green-color` |
| Info | `--gc-wizard-info` | `--gc-alert-stroke-blue-color` |
| Border radius | `--gc-wizard-radius` | `--gc-card-view-border-radius` |

The token **values** are Gcore-maintained and vendored into this repo — see [`TOKENS.md`](TOKENS.md) for the full catalog (name → value → light/dark). The `check-tokens` lint gate (`scripts/check-tokens.mjs`, wired into `lint:css`) rejects any `var(--gc-*)` that isn't a real token.

---

## Template Parameter Constraints

Templates expose their params through `session.fastedge.templates.read({id}).params`.
The `metadata` field on each param is a JSON bag that can carry constraint annotations
beyond what `mandatory: boolean` expresses: `shared_across_apps`, `conditional-required`
(with a `when` condition), and `profile_selector`.

**Reference:** [context/PARAM_CONSTRAINTS.md](PARAM_CONSTRAINTS.md) — defines the
convention, shows the edge-totp worked example, and includes the shared-secret recipe.

---

## Developer Skills

Slash commands (`.claude/skills/`) — invoke from the `fastedge-wizard-apps/` workspace root:

| Command | What it does |
|---------|-------------|
| `/wizard-intake` | Fetches target template params via the Gcore API, writes `wizards/<customer-name>-<account-id>/<name>/TARGET.md` + initial fixture templates with normalised mock-host IDs. Run as step zero before building a wizard. |
| `/sync-wizard-fixtures` | Fetches live Gcore templates/apps/secrets, presents selection menus, fudges IDs, writes `fixtures/` and validates against SDK schemas. |
| `/wizard-publish` | Run after merge: sets `WIZARD_SOURCE_CONFIG` (+ `companionTemplateIds`) on a wizard's launch template via the Gcore API — the manual "wire it live" step from CONTRIBUTING.md §7. Idempotent. |

---

## Partner repos

The proxy can allow-list additional source repos (e.g. a partner's own wizard repo).
Each is a repo of wizard subdirectories using the same `@gcoredev/fastedge-wizard-sdk`
dep; the partner manages their own SDK pins, builds, and publish/serve strategy
independently — their `WIZARD_SOURCE_CONFIG` ref/cdn need not match this repo's.

---

## Wizard Registry

| Wizard | Directory | Status | Notes |
|--------|-----------|--------|-------|
| Intent reference (all v1 write intents, heavily commented) | `wizards/_example-intents/` | Active (dev-only, not published) | See `src/main.js` — copy patterns from here |
| edge-totp (two-app: `proxy-wasm` filter + `wasi-http` app, CDN wiring) | `wizards/gcore/edge-totp/` | Active — reference React / multi-app wizard | Built in the "real wizard" experiment; canonical example for CDN rules/origins, shared secrets, Edge Storage binding, and Profile A/B |
| edge-sso (two-app: `proxy-wasm` filter + `wasi-http` auth-app, 3 variants via `SSO_VARIANT`) | `wizards/gcore/edge-sso/` | Active — reference multi-variant wizard | 2 templates total; `SSO_VARIANT` written identically to both selects gate-only/cookie/header behaviour at runtime — no per-variant template selection. Canonical example for variant-by-param design and ES256-keypair vs. shared-secret session signing |
| html2md (single `proxy-wasm` app, zero params, resource-level CDN wiring) | `wizards/gcore/html2md/` | Blocked on SDK release — see `context/wizards/html2md/DOCS.md` | Canonical example for `deployment.plan`'s `cdnResourceFastedgeHandlers` (resource-level `options.fastedge`, not a path rule) — the only way to reach `on_response_body`/`on_request_body` |

> Starters (not wizards): `wizards/_template` (vanilla), `wizards/_template-react` (React).

_Add rows here when new wizards are added._
