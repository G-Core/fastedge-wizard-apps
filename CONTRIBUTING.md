# Contributing a Wizard

Wizards are plain HTML + JavaScript apps that run inside the Gcore portal via an iframe bridge. This guide is the **end-to-end process for building one and getting it merged**.

> **New here?** Read [`README.md`](README.md) first — it orients you on what a wizard is, the repo layout, and gets one running locally in about a minute. Come back here to build and submit for real.

---

## How it works

Your wizard lives at `wizards/<customer-name>-<account-id>/<name>/` (source only); CI builds and publishes it — see [`README.md`](README.md#repo-layout) for the build → `gh-pages` → jsDelivr → proxy topology.

**Naming your wizard's folder:** nest it one level under `wizards/` in a
`<customer-name>-<account-id>/` folder — e.g. `wizards/acme-corp-482913/onboarding-wizard/`.
The account id is what actually disambiguates: customer *names* collide (two
"Acme"s, a rename) but account ids don't, and this keeps two customers'
wizards from ever colliding under `release/` or in a template's `wizardDir`.
The one exception is `wizards/gcore/` — G-Core's own wizards, no account-id
suffix, since it's this repo's own namespace rather than a customer account.

The part that matters for submission: **merging does not make a wizard live.** After a wizard merges, the Gcore team creates a FastEdge template that points to it via `WIZARD_SOURCE_CONFIG` — that publish step is what surfaces it in the portal.

---

## Prerequisites

- Node.js 20+
- Any package manager (pnpm, npm, yarn, bun — your choice)
- Git

---

## 1. Fork and clone

```bash
# Fork G-Core/FastEdge-Wizard-apps on GitHub, then:
git clone https://github.com/<your-org>/FastEdge-Wizard-apps
cd FastEdge-Wizard-apps
```

---

## 2. Create your wizard

**Step zero — understand your target template first:**

Before writing wizard logic, get the full param list for your target template(s)
from the Gcore API. The fastest way is to call
`session.fastedge.templates.read({ id })` from a sandbox or to ask the Gcore team
to share the param table for your template. If you have Gcore portal access and
Claude Code, the `/wizard-intake` skill automates this: it fetches params via the
API and writes a `TARGET.md` brief in your wizard directory (do not commit it —
it contains account-scoped IDs).

Either way, the output you need before continuing is: every param name, its
`data_type`, whether it is `mandatory`, its `default_value`, any `metadata`
constraints (`shared_across_apps`, `conditional-required`), and which app in a
multi-app wizard owns it. See §3 for how to read and use this information.

Pick a starting template:

| Template | When to use |
|---|---|
| `wizards/_template` | Vanilla JS — plain HTML + the SDK |
| `wizards/_template-react` | React 19 — pre-wired with the step-kit |

```bash
cp -r wizards/_template wizards/<customer-name>-<account-id>/<your-wizard-name>        # vanilla
# or
cp -r wizards/_template-react wizards/<customer-name>-<account-id>/<your-wizard-name>  # React
cd wizards/<customer-name>-<account-id>/<your-wizard-name>
```

**If you used `_template-react`:** it depends on `@gcore/wizard-step-kit` via
`file:../../packages/wizard-step-kit`, correct only for the template's own
(unnested) location. Your copy is one level deeper, so update `package.json`
to `file:../../../packages/wizard-step-kit` (one more `../`) before installing
— `pnpm install` fails to resolve the old path otherwise.

Edit `package.json` — set `"name"` and the SDK dependency (templates and examples track `"latest"`; a production wizard can pin a specific published version — check `context/INDEX.md`):

```json
{
  "name": "your-wizard-name",
  "dependencies": {
    "@gcoredev/fastedge-wizard-sdk": "latest"
  }
}
```

Install and run the mock host:

```bash
pnpm install    # or npm install / yarn / bun
pnpm run dev    # builds and starts mock host at http://localhost:9999
```

Open http://localhost:9999 — you get a browser dev-tools-style panel next to your wizard that simulates the portal bridge. Approve/deny write-intent consent dialogs, toggle light/dark theme, and watch the event log.

**Fixture data** (optional but recommended for realistic mock data): create a `fixtures/` directory next to `src/`. Fixture files are namespaced by resource group — `fastedge/templates.json`, `fastedge/apps.json`, `fastedge/secrets.json`, `fastedge/stores.json`, `cdn/resources.json`, `cdn/origins.json`, `cdn/rules.json` — matching the intent namespace. The SDK validates these against its schemas on startup.

**You only need to override `fastedge/templates.json`.** The mock host ships built-in stub data for every other resource group (CDN resources, stores, secrets, apps, origins, rules) — pickers and generate/create stubs work end-to-end with no fixture files. A group's fixture file overrides the stubs only when it exists and is non-empty. See `mock-host/stubs.js` in the installed SDK for the defaults.

If you are a Gcore team member with portal access, you can pull real data from a live account into your fixture files with the `/sync-wizard-fixtures` skill (Claude Code). Run it from `wizards/<your-wizard>/` — it fetches live templates, apps, secrets, stores, and CDN resources, then writes fudged (safe-to-commit) fixture files. This is the fastest way to get representative data without hand-crafting JSON.

If you do **not** have portal access, hand-craft fixtures from the template's README and params. Check `wizards/gcore/edge-totp/fixtures/` for a committed example — it covers both templates, their full param lists, and enough CDN/secret/store data to plan and apply in the mock host.

---

## 3. Study your target template

Before writing wizard logic, understand the template you are deploying. Every
constraint you miss here becomes a hard-coded assumption or a silent breakage.

Before writing wizard logic, make sure you have the param table from §2. The
param list is the document you reason against for the rest of this section.

**The param source of truth is `fastedge.templates.read` (live API) + the
template's own README/docs — never `registry.json`.** That file is a CI/CD
artefact used by the team's production deployment pipeline; template IDs in it
reflect the team's production account and will differ from any other account
(preprod, personal, customer). Use the live API to resolve IDs for the account
you are working on.

**When `long_descr` contradicts the param list, trust the param list.** Template
prose descriptions can lag behind the code; the actual `params` array returned by
`templates.read` is always authoritative about which app owns which env var or
secret. If you spot a contradiction, note it as a bug in the template source repo
— but code against the param list, not the prose.

**Reading the param list — what to look for:** open `fixtures/fastedge/templates.json`
(written by `/sync-wizard-fixtures` if you have portal access, or hand-crafted from
the template README) and check every param:

- Which params have `"data_type": "secret"` or `"data_type": "store"`? Note: params
  that hold an Edge Storage id or name are often typed `"string"` (e.g. `KV_STORE_ID`,
  `KV_STORE_NAME`) — treat them the same as `"store"` typed params (see below).
- Which are `"mandatory": false` but referenced in the template's README as required for a specific mode?
- Are there params that must match across multiple apps? (See `context/PARAM_CONSTRAINTS.md`.)
- Does the template have a profile/variant concept (e.g. Profile A vs B) that changes which params are needed?

For multi-template wizards: make sure you have the param list for **all** target
templates. Params marked `shared_across_apps` in their `metadata` must carry the
same value on every app — the wizard collects them once and binds everywhere.

**Edge Storage binding pattern** — if an app needs a store id or name in its env:

1. Call `session.fastedge.stores.pickOrCreate()` (user selects an existing store or creates one inline) **before** `deployment.plan()`
2. Inject the returned `{ id, name }` directly into the app's `env` in the plan

The deploy plan does **not** create secrets or stores — always create them eagerly (as above) and reference them by id in `env` / `secretRefs`. `edge-totp` and `wizards/_example-intents/src/main.js` demonstrate the pattern.

The Gcore template `edge-totp` is the canonical worked example — two apps
(`otp-app` wasi-http + `otp-filter` proxy-wasm) where `MFA_SESSION_KEY`,
`AUTH_PREFIX`, and `KV_STORE_NAME` must match, and `MFA_AUDIENCE` is
`mandatory: false` but fail-closes the filter when absent in Profile B. See
`context/PARAM_CONSTRAINTS.md` for the full example and the shared-secret recipe.

### Selecting secrets & stores

Each secret/store a wizard needs maps to **one** SDK call, chosen by *what the value is* —
**not** by "pick vs create". The host owns that branch: `pickOrCreate` opens a picker where
the user selects an existing resource **or** creates a new one inline, in the same modal. Do
not build your own `[Create] [Pick existing]` pair — that is the old pattern and the intents
behind it (`secrets.create`/`pick`/`list`, `stores.create`/`pick`/`list`) no longer exist.

| The value is… | Call | Returns |
| --- | --- | --- |
| Brought by the user — reuse an existing secret/store, or paste a real external value (API token) | `secrets.pickOrCreate()` / `stores.pickOrCreate()` | `{ id, name, origin }[]` (take `[0]` for single-select) |
| A random secret the wizard defines, at a chosen strength (HMAC/signing keys) | `secrets.pickOrCreate({ name?, comment?, bytes })` — `bytes` arms the create-inline Generate button | `{ id, name, origin }[]` (take `[0]`) |
| An asymmetric keypair whose public half the wizard needs (ES256) | `secrets.generateKeypair({ name, comment?, algorithm })` | `{ id, name, publicKey }` |

**Optional / conditional resources.** `pickOrCreate` removes the *pick-vs-create* branch, but
it does **not** remove *whether-to-ask* branching. A `mandatory: false` param, or one gated on a
profile/mode (e.g. `MFA_PROOF_SIGNING_KEY` exists only in edge-totp's Profile B), is legitimate
branching: the wizard decides whether the resource is needed at all from earlier answers. The rule:

> **Branch on whether to collect a resource, never on how to select it.**

If the resource is needed → one `pickOrCreate` / `generate*` call → bind the ref into the plan.
If it isn't → don't collect a ref and don't put it in the plan. Wiring an optional secret
unconditionally, or omitting one the active profile requires, is the failure mode to avoid — not
which button to show.

---

## 4. Build and design rules

### CSS — no raw values

Use `var(--gc-*)` design tokens everywhere. Raw colour literals, px font-sizes, and hardcoded spacing values fail the CI lint gate:

```css
/* ✗ fails */
color: #333;
background: rgb(255, 0, 0);

/* ✓ passes */
color: var(--gc-font-color);
background: var(--gc-background-primary-color);
```

The token reference is in `context/INDEX.md`. Tokens are provided at runtime via
`/styles/v1/wizard.css` — injected automatically, no `<link>` required in your HTML.

### HTML — classless first

The portal injects `/styles/v1/wizard.css` into every wizard HTML response (both
in production via the WASM proxy and locally via the dev server). It styles bare
semantic elements — `<button>`, `<input>`, `<h1>`, `<label>`, etc. — so plain HTML
looks like the portal with zero classes. **You do not need any explicit `<link>` tag
for base styles in your `index.html`.**

Write semantic HTML; add classes only for genuine variants:

```html
<!-- ✗ avoid -->
<button class="gc-btn gc-btn--primary">Submit</button>

<!-- ✓ prefer -->
<button>Submit</button>
```

Your `styles.css` should contain only wizard-specific layout and variant classes —
not resets, body styles, or element base styles that are already in the shared base.

### Frameworks

**Rendering frameworks (`react`/`react-dom`, Vue, Svelte, etc.) are allowed.** They
produce semantic HTML that wizard.css styles correctly. `_template-react` is the
reference implementation.

**Bring-your-own UI libraries (MUI, Ant Design, shadcn, Tailwind, etc.) are not
allowed.** They ship their own styles that override the shared base and bypass the
token enforcement gates.

Framework-based wizards are reviewed against the same screenshot baseline — if it
looks foreign, the diff fails. React's `style={{}}` prop bypasses stylelint — if you
use it, values must be `var(--gc-*)` tokens; the screenshot diff is the gate.

### Security

The WASM proxy enforces `connect-src 'none'` — your wizard cannot make any network requests. All data comes through the bridge:

```js
const session = await connect({ expectedHostOrigin: hostOrigin });
const templates = await session.fastedge.templates.list();
```

No `fetch()`, no `XMLHttpRequest`, no WebSocket.

The full capability surface — everything you can do through the bridge — is the SDK's `WizardSession` type. After `pnpm install`, the best entry point is `node_modules/@gcoredev/fastedge-wizard-sdk/docs/quickstart.md` — it covers `connect()`, intent patterns, error handling, and fixture setup. The `.d.ts` files (`dist/types.d.ts`, `dist/sdk.d.ts`) are the type-level source of truth. The summary in `context/INDEX.md` is a convenience reference.

For a runnable worked example of every intent in sequence, see `wizards/_example-intents/src/main.js` — it exercises all v1 write intents with inline docs explaining consent points, ref→id resolution, and rollback semantics.

> **Note:** additional architecture/design docs are maintained internally by Gcore; you don't need them — this repo's `context/` covers everything required to build a wizard.

---

## 5. Before opening a PR

First, make sure the repo root is installed (once per clone):

```bash
# from fastedge-wizard-apps/ root — installs the lint toolchain
pnpm install
```

Then run the gates from the repo root:

```bash
pnpm -w run lint:css     # must pass — no raw colours
pnpm run build           # builds all wizards — must pass cleanly
```

> **Root vs wizard build**: `pnpm run build` from the repo root builds every wizard and assembles `release/`. `pnpm run build` from `wizards/<customer-name>-<account-id>/<name>/` builds only your wizard into its own `dist/`. The gate above requires the root build to pass.

Check your wizard in both themes (the mock host has a "Switch to dark" button). Check at 1280×800 and a narrower viewport.

Make sure you have committed:
- `src/` — your source files
- `package.json` and your lockfile (`pnpm-lock.yaml`, `package-lock.json`, etc.)
- `pnpm-workspace.yaml` (if using pnpm — required for isolated install)
- `fixtures/` (optional but recommended)

**Do not commit** `dist/` or `node_modules/` — CI builds from source.

---

## 6. Open a PR

Target `main`. In the description include:

- What the wizard does (one paragraph)
- Which FastEdge template it is intended for
- Any non-obvious decisions in the implementation

CI runs two checks on the PR:
- **Stylelint** — no raw colour literals
- **Screenshot diff + a11y** — renders in light and dark, checks for critical axe violations

Both must pass before merge.

---

## 7. After merge

CI builds all wizards and force-pushes built output to the `gh-pages` branch. jsDelivr picks it up within minutes (CI purges the cache after publish).

The wizard is not yet live in the portal. The Gcore team then:
1. Runs `/wizard-publish` to set `WIZARD_SOURCE_CONFIG` (and `companionTemplateIds`,
   for a multi-app wizard) on the launch FastEdge template via the Gcore API
2. Verifies it against a real portal environment

Once the template is published, the wizard is live.

---

## Questions?

Open an issue or reach out via the discussion thread for your wizard PR.
