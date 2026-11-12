# edge-totp — TOTP MFA Wizard

## What it is

The canonical real wizard: it sets up TOTP-based multi-factor authentication enforced at the edge, as **two FastEdge apps wired onto a CDN resource**:

- **`app`** (`wasi-http`) — the login / challenge / enrollment flow the user hits at the auth prefix.
- **`filter`** (`proxy-wasm`) — a CDN filter that verifies the `mfa_session` cookie on every protected request and redirects to the login flow when it's missing/invalid (it self-bypasses the auth prefix + `/health`).

It's the reference example for multi-app deploy, CDN origin+rule wiring, shared secrets, Edge Storage binding, keypair generation, and Variant A/B branching.

## Tech stack

React 19 (JSX via esbuild `--jsx=automatic --minify`) with `@gcore/wizard-step-kit/react` for the stepped shell; the SDK is bundled in.

```
wizards/gcore/edge-totp/
  src/
    index.html
    main.jsx          ← boot (template mode vs Re-entry) + deploy orchestration
    deployment.js     ← field map: where every form field lives in the deployment; skeleton; plan
    deployment.test.js← load→save round trips (`pnpm test`, node:test)
    components.jsx
    styles.css
    steps/            ← one file per wizard step (see below)
  fixtures/           ← committed mock-host data (both templates + params + CDN/secret/store)
  package.json
```

Never commit `dist/`/`release/` — CI builds and publishes.

## Build & dev

```bash
cd wizards/gcore/edge-totp
pnpm install
pnpm run dev          # builds + starts the SDK mock host on localhost
pnpm run dev:watch    # esbuild --watch in a second terminal (no host restart)
```

## Steps

`Overview → Variant → CDN resource → Routing & tokens → Edge Storage → Secrets → TOTP settings → Branding → Review`, then a deploy-progress screen. Steps 6–8 are conditional (custom TOTP/branding panels; Variant B adds an MFA-proof key).

## Resources it creates (the interesting part)

| Resource | SDK call | Notes |
|---|---|---|
| Session / handoff / enroll keys | `secrets.pickOrCreate({ name, bytes: 32 })` | `bytes` arms the create-inline Generate button; the same picker lets a re-run reuse a key a prior run created |
| Gcore API token | `secrets.pickOrCreate()` | user brings it (Edge Storage write access) — pick existing or paste |
| MFA-proof key (Variant B only) | `secrets.generateKeypair({ algorithm: 'ES256' })` | public JWK → app env `MFA_PROOF_PUBLIC_JWK`; private half is a secret ref |
| Edge Storage (TOTP seeds) | `stores.pickOrCreate()` | id bound to app `storeRefs` (`TOTP_USER_SEEDS`, the read binding) and to app `env` (`KV_STORE_ID`, for the `/enroll` write path) — created **before** the plan |
| CDN resource | `cdn.resources.pick()` | the delivery domain to wire onto |

Everything above is created **eagerly** and referenced by id in the plan. The plan (`session.deployment.deploy(planParams, { onPlan, onProgress })`) creates the two apps (the shared routing keys are written into both apps' `env`), one origin `app-origin`, and the CDN rules:

| Rule Ref | Pattern | What |
|---|---|---|
| `app-route` | `^<authPrefix>` (weight 1) | routes the login/challenge paths to the app origin |
| `filter:*` | `^/.*` (weight 10) | "Protect the entire site": one catch-all rule attaching the filter `on_request_headers` |
| `filter:<path>` | `^<escaped path>` (weight 10) | "Protect specific paths": one rule per path |

A rule's Ref is its content, so editing a protected path on Re-entry deletes that rule and creates a new one.

## How the plan is built (field map)

`src/deployment.js` declares once, with the SDK's `defineFieldMap`, where each form field lives:
- env keys on one or both apps;
- secret and store bindings;
- the Variant B keypair;
- `custom` fields for values spread over several places (`authPrefix` = `AUTH_PREFIX` on both apps + the `app-route` rule; `protection` = the `filter:` rules; `store` = `KV_STORE_ID` + the `TOTP_USER_SEEDS` binding; the TOTP / policy / branding groups).

Both modes use the same map:
- **Template mode:** `fields.save(form, skeleton(...))` → `newCdnOrigins` / `newCdnRules`.
- **Re-entry:** `fields.load(deployment.current())` → form; Finish → `fields.save(form, current)` → desired-state `cdnOrigins` / `cdnRules` + `revision`.

Keys the map doesn't own (hand edits in the dashboard) pass through unchanged. Every `custom` field has a round-trip test in `deployment.test.js`.

## Re-entry

Opened on a deployed app (`launchTemplateId: null`), the wizard loads its form from `session.deployment.current()`.
- **Fixed after the first deploy:** the deployment name, CDN resource, variant, auth prefix (both env keys and the `app-route` rule), seed store and session signing key, plus what enrolled users depend on: OTP digits, period, algorithm and the storage key prefix (`enrollment`, a read-only fixed field over keys the TOTP and policy groups write). Variant B reuses its keypair; if it can't be read (e.g. the public JWK is gone), the step offers Generate, with a warning that the origin needs the new public key.
- A field that couldn't be read and is left as loaded keeps its deployed value (`reentryValues`), so navigation doesn't require it to pass the checks a replacement value does.
  - The map marks its fixed fields with `field.fixed(reason, …)`; `lockedFields(current)` (`deployment.js`) adds the host-fixed name and CDN resource and returns `{ field: reason }`, which the steps pass to the kit (`ResourceRow locked`, `<Locked>` around a disabled `Field`). `fields.save` refuses to change a fixed field on the live deployment.
  - A fixed field whose deployed value couldn't be read (e.g. the store binding was removed by hand) is not locked, so the user can repair it.
- **Fields that can't be read** (a value edited outside the wizard; the two store bindings disagree; a filter rule pattern the wizard didn't write) are listed on the Overview step. They show defaults, and deploying leaves the deployed value alone unless the user changes the field.

## Variants

**A** (default) — session-cookie MFA only. **B** — adds a signed **MFA proof** (the ES256 keypair above + `PROOF_TTL` / `MFA_PROOF_COOKIE` env), so downstream services can verify MFA independently.

## Template config

Two templates (the app + the filter). The one carrying `WIZARD_SOURCE_CONFIG` also declares its companion via `companionTemplateIds`:

```
WIZARD_SOURCE_CONFIG={"repo":"G-Core/FastEdge-Wizard-apps","ref":"gh-pages","wizardDir":"gcore/edge-totp","cdn":"jsdelivr","companionTemplateIds":[<other-template-id>]}
```

## Fixtures & e2e

`fixtures/fastedge/templates.json` holds both templates and their full param lists — enough for the mock host to render the wizard. Refresh live data with `/sync-wizard-fixtures`. The repo-root Playwright suite (`pnpm test:e2e`) screenshots the wizard in both themes and runs axe, once in template mode and once in Re-entry (a `deployment.current` stub in `REENTRY`, `e2e/theme.spec.ts`).

## SDK version

Tracks `"@gcoredev/fastedge-wizard-sdk": "latest"` — see `context/INDEX.md` for the version notes. After a bump, re-validate fixtures (`npx fastedge-wizard-sdk dist --validate-only`); a schema change may need `/sync-wizard-fixtures` or a manual fixture edit.
