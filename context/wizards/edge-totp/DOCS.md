# edge-totp — TOTP MFA Wizard

## What it is

The canonical real wizard: it sets up TOTP-based multi-factor authentication enforced at the edge, as **two FastEdge apps wired onto a CDN resource**:

- **`app`** (`wasi-http`) — the login / challenge / enrollment flow the user hits at the auth prefix.
- **`filter`** (`proxy-wasm`) — a CDN filter that verifies the `mfa_session` cookie on every protected request and redirects to the login flow when it's missing/invalid (it self-bypasses the auth prefix + `/health`).

It's the reference example for multi-app deploy, CDN origin+rule wiring, shared secrets, Edge Storage binding, keypair generation, and Profile A/B branching.

## Tech stack

React 19 (JSX via esbuild `--jsx=automatic --minify`) with `@gcore/wizard-step-kit/react` for the stepped shell; the SDK is bundled in.

```
wizards/gcore/edge-totp/
  src/
    index.html
    main.jsx          ← plan assembly + deploy orchestration
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

`Overview → Profile → CDN resource → Routing & tokens → Edge Storage → Secrets → TOTP settings → Branding → Review`, then a deploy-progress screen. Steps 6–8 are conditional (custom TOTP/branding panels; Profile B adds an MFA-proof key).

## Resources it creates (the interesting part)

| Resource | SDK call | Notes |
|---|---|---|
| Session / handoff / enroll keys | `secrets.pickOrCreate({ name, bytes: 32 })` | `bytes` arms the create-inline Generate button; the same picker lets a re-run reuse a key a prior run created |
| Gcore API token | `secrets.pickOrCreate()` | user brings it (Edge Storage write access) — pick existing or paste |
| MFA-proof key (Profile B only) | `secrets.generateKeypair({ algorithm: 'ES256' })` | public JWK → app env `MFA_PROOF_PUBLIC_JWK`; private half is a secret ref |
| Edge Storage (TOTP seeds) | `stores.pickOrCreate()` | id bound to app `storeRefs` (`TOTP_USER_SEEDS`, the read binding) and to app `env` (`KV_STORE_ID`, for the `/enroll` write path) — created **before** the plan |
| CDN resource | `cdn.resources.pick()` | the delivery domain to wire onto |

Everything above is created **eagerly** and referenced by id in the plan. The plan itself (`session.deployment.deploy(planParams, { onPlan, onProgress })`) creates the two apps + shared env, one `newCdnOrigins` (app origin), and two `newCdnRules`:

- `app-route` — `^<authPrefix>` → routes the login/challenge paths to the app origin.
- `filter-rule` — `^/.*` (catch-all) with a `fastedgeFilter` attaching the proxy-wasm filter `on_request_headers`.

## Profiles

**A** (default) — session-cookie MFA only. **B** — adds a signed **MFA proof** (the ES256 keypair above + `PROOF_TTL` / `MFA_PROOF_COOKIE` env), so downstream services can verify MFA independently.

## Template config

Two templates (the app + the filter). The one carrying `WIZARD_SOURCE_CONFIG` also declares its companion via `companionTemplateIds`:

```
WIZARD_SOURCE_CONFIG={"repo":"G-Core/FastEdge-Wizard-apps","ref":"gh-pages","wizardDir":"gcore/edge-totp","cdn":"jsdelivr","companionTemplateIds":[<other-template-id>]}
```

## Fixtures & e2e

`fixtures/fastedge/templates.json` holds both templates and their full param lists — enough for the mock host to render the wizard. Refresh live data with `/sync-wizard-fixtures`. The repo-root Playwright suite (`pnpm test:e2e`) screenshots the wizard in both themes and runs axe.

## SDK version

Tracks `"@gcoredev/fastedge-wizard-sdk": "latest"` — see `context/INDEX.md` for the version notes. After a bump, re-validate fixtures (`npx fastedge-wizard-sdk dist --validate-only`); a schema change may need `/sync-wizard-fixtures` or a manual fixture edit.
