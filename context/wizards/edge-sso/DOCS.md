# edge-sso — SSO / Session-Gate Wizard

## What it is

A three-variant SSO / MFA-adjacent auth wizard: it sets up a session-cookie login flow enforced at the edge, as **two FastEdge apps wired onto a CDN resource** — same shape as edge-totp:

- **`app`** (`wasi-http`, "SSO - Auth App") — the login flow (OAuth/SAML providers + session issuance) the user hits at the auth prefix.
- **`filter`** (`proxy-wasm`, "SSO - CDN Filter") — a CDN filter that verifies the session on every protected request and redirects to the login flow when it's missing/invalid (it self-bypasses the auth prefix).

Both templates carry real, non-empty params — neither is an inert placeholder. The CDN filter is the launch template (a portal-UX choice: launching from the CDN side); its `WIZARD_SOURCE_CONFIG` carries `companionTemplateIds: [<auth-app id>]`. All three variants (gate-only / cookie / header) are selected by a single `SSO_VARIANT` param written identically to both templates at deploy time — there is no per-variant template selection (an earlier design with 6 per-variant companion templates was never shipped; see `TARGET.md` for the history). It's the reference example for a variant-by-param wizard, and for asymmetric (ES256 keypair) vs. shared-secret (HS256) session signing.

## Tech stack

React 19 (JSX via esbuild `--jsx=automatic --minify`) with `@gcore/wizard-step-kit/react` for the stepped shell; the SDK is bundled in.

```
wizards/gcore/edge-sso/
  src/
    index.html
    main.jsx          ← plan assembly + deploy orchestration + template classification
    components.jsx
    styles.css
    steps/            ← one file per wizard step (see below)
  fixtures/           ← committed mock-host data (both templates + params)
  package.json
```

Never commit `dist/`/`release/` — CI builds and publishes.

## Build & dev

```bash
cd wizards/gcore/edge-sso
pnpm install
pnpm run dev          # builds + starts the SDK mock host on localhost
pnpm run dev:watch    # esbuild --watch in a second terminal (no host restart)
```

## Steps

`Overview → Variant → CDN resource → Routing & session → Signing → Providers → Branding → Review`, then a deploy-progress screen. Branding is optional; Signing branches on the chosen variant (random secret vs. ES256 keypair).

## Template identification

On connect, the wizard reads `ctx.launchTemplateId` + `ctx.companionTemplateIds`, fetches details for all of them, and classifies by `api_type` alone (`wasi-http` → auth app, `proxy-wasm` → CDN filter) — see the connect effect in `main.jsx`. It never hard-codes a template id. If the combined set isn't exactly one of each, the wizard errors out (`Expected exactly one proxy-wasm filter and one wasi-http auth app`) instead of guessing.

## Resources it creates

| Resource                                                                                                                           | SDK call                                                | Notes                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                                                                                                                   | `secrets.pickOrCreate({ name, bytes: 32 })`             | gate-only/header only. Bound as `secretRefs.SESSION_SECRET` on **both** app and filter (shared HMAC key).                                                                                                                                                                                                               |
| `SESSION_SIGNING_KEY` + `SESSION_PUBLIC_JWK`                                                                                       | `secrets.generateKeypair({ name, algorithm: 'ES256' })` | cookie variant only. Private half → app `secretRefs.SESSION_SIGNING_KEY`; public JWK → plain `env.SESSION_PUBLIC_JWK` on **both** app and filter. Even in this variant the app still gets `secretRefs.SESSION_SECRET` (signs OAuth/SAML flow cookies) — the filter does not, since it verifies via the public JWK only. |
| Provider secrets (`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`, `IDP_CERT`) | `secrets.pickOrCreate()`                                | User-brought — pasted external OAuth client secret / SAML IdP cert, one per selected provider.                                                                                                                                                                                                                          |
| CDN resource                                                                                                                       | `cdn.resources.pick()`                                  | the delivery domain to wire onto                                                                                                                                                                                                                                                                                        |

No Edge Storage step — the source repo is explicit that KV is not used for config (too expensive per read); neither template declares a `data_type: "store"` param.

Everything above is created **eagerly** and referenced by id in the plan. The plan itself (`session.deployment.deploy(planParams, { onPlan, onProgress })`) creates the two apps + shared env, one `newCdnOrigins` (app origin), and a `newCdnRules` set:

- `app-route` — `^<authPrefix>` → routes the login/auth paths to the app origin.
- One or more filter rules, per the **Protection scope** choice on the Routing step (same pattern as edge-totp): `all` emits a single `filter-rule` (`^/.*` catch-all); `paths` emits one `filter-rule-<i>` per comma-separated protected path prefix (`^<escaped path>`). Every filter rule attaches the same proxy-wasm filter app via `fastedgeFilter` (`on_request_headers`). There is no default scope — the user must choose one before continuing.

## Variants

- **gate-only** — session-cookie pass/fail only, HS256 via shared `SESSION_SECRET`. Delivers nothing to origin.
- **cookie** — delivers a verifiable ES256 JWT cookie; filter verifies via `SESSION_PUBLIC_JWK` only (never holds a forge-capable secret).
- **header** — same HS256 signing as gate-only; the filter additionally injects `x-sso-*` identity headers upstream (a compile-time feature of that template, not a wizard-configured param).

`SSO_AUDIENCE` is fail-closed on the filter (rejects everything if unset/mismatched) and must be identical to the app's value on whichever variant is active; `SESSION_COOKIE` and, if set, `SSO_ISSUER` must also match across both apps.

## Providers

The wizard collects one or more of Google / GitHub / Microsoft / Facebook / SAML, shared identically across all three variants (`StepProviders.jsx`). Each provider's client-id/secret is `mandatory: false` at the API level but is the de facto trigger for enabling that provider. If Microsoft is selected and left on the wildcard `MICROSOFT_TENANT` default, nudge the user toward setting `MICROSOFT_ALLOWED_TENANTS`.

Google/Microsoft/Facebook each have a Redirect URI field, pre-filled on selection as `https://<cdn.cname><authPrefix>/callback/<provider>` (derived once the CDN resource and auth prefix are known — the auth app _is_ the host, so the wizard already knows this value). The user can still edit it for a non-default callback path; the field is only left blank, and the corresponding `*_REDIRECT_URI` env var omitted, if they clear it. GitHub and SAML don't take a redirect URI param.

## Template config

Two templates total: "SSO - CDN Filter" (`proxy-wasm`, the launch template) and "SSO - Auth App" (`wasi-http`, its sole companion). The launch template carries `WIZARD_SOURCE_CONFIG` with the auth-app's template id (account-scoped — resolve via `fastedge.templates.read` for the target account, not hard-coded here):

```
WIZARD_SOURCE_CONFIG={"repo":"G-Core/FastEdge-Wizard-apps","ref":"gh-pages","wizardDir":"gcore/edge-sso","cdn":"jsdelivr","companionTemplateIds":[<auth-app-template-id>]}
```

Source of truth for both templates' params lives in [FastEdge-templates/edge-sso](https://github.com/G-Core/FastEdge-templates/tree/main/edge-sso).

## Fixtures & e2e

`fixtures/fastedge/templates.json` holds both templates and their full param lists — enough for the mock host to render the wizard. The mock host convention normalises ids so the launch template is always fixture id 1 and companions are ids 2-19 (regardless of the real platform template id); the CDN filter is fixture id 1 here since it's the launch template. Refresh live data with `/sync-wizard-fixtures`. The repo-root Playwright suite (`pnpm test:e2e`) screenshots the wizard in both themes and runs axe.

## SDK version

Pinned to `"@gcoredev/fastedge-wizard-sdk": "0.0.5"` (same as edge-totp and html2md) — see `context/INDEX.md` for the version notes. After a bump, re-validate fixtures (`npx fastedge-wizard-sdk dist --validate-only`); a schema change may need `/sync-wizard-fixtures` or a manual fixture edit.
