# edge-sso — SSO / Session-Gate Wizard

## What it is

A three-variant SSO / MFA-adjacent auth wizard: it sets up a session-cookie login flow enforced at the edge, as **two FastEdge apps wired onto a CDN resource** — same shape as edge-totp, but with a "pick 2 of N companions" variant branch on top:

- **`app`** (`wasi-http`) — the login flow (OAuth/SAML providers + session issuance) the user hits at the auth prefix.
- **`filter`** (`proxy-wasm`) — a CDN filter that verifies the session on every protected request and redirects to the login flow when it's missing/invalid (it self-bypasses the auth prefix).

The launch template (`SSO Wizard Launcher`) is an inert placeholder — `params: null` — that exists solely to carry `WIZARD_SOURCE_CONFIG`. All six real templates (3 variants × {auth-app, filter}) are companions; the wizard picks the 2 matching the chosen variant and ignores the other 4. It's the reference example for a variant picker over companion templates, and for asymmetric (ES256 keypair) vs. shared-secret (HS256) session signing.

## Tech stack

React 19 (JSX via esbuild `--jsx=automatic --minify`) with `@gcore/wizard-step-kit/react` for the stepped shell; the SDK is bundled in.

```
wizards/edge-sso/
  src/
    index.html
    main.jsx          ← plan assembly + deploy orchestration + template classification
    components.jsx
    styles.css
    steps/            ← one file per wizard step (see below)
  fixtures/           ← committed mock-host data (all 7 templates + params)
  package.json
```

Never commit `dist/`/`release/` — CI builds and publishes.

## Build & dev

```bash
cd wizards/edge-sso
pnpm install
pnpm run dev          # builds + starts the SDK mock host on localhost
pnpm run dev:watch    # esbuild --watch in a second terminal (no host restart)
```

## Steps

`Overview → Variant → CDN resource → Routing & session → Signing → Providers → Branding → Review`, then a deploy-progress screen. Branding is optional; Signing branches on the chosen variant (random secret vs. ES256 keypair).

## Template identification

The launch template (id unknown at build time, name `SSO Wizard Launcher`) is never read for params. On connect, the wizard requires `ctx.companionTemplateIds.length === 6` and classifies each companion by name substring (`gate-only` / `cookie` / `header`) + `api_type` (`wasi-http` → auth, `proxy-wasm` → filter) — see `classifyTemplates()` in `main.jsx`. It never hard-codes a template id. If any variant is missing an auth+filter pair, the wizard errors out instead of guessing.

## Resources it creates

| Resource | SDK call | Notes |
|---|---|---|
| `SESSION_SECRET` | `secrets.pickOrCreate({ name, bytes: 32 })` | gate-only/header only. Bound as `secretRefs.SESSION_SECRET` on **both** app and filter (shared HMAC key). |
| `SESSION_SIGNING_KEY` + `SESSION_PUBLIC_JWK` | `secrets.generateKeypair({ name, algorithm: 'ES256' })` | cookie variant only. Private half → app `secretRefs.SESSION_SIGNING_KEY`; public JWK → plain `env.SESSION_PUBLIC_JWK` on **both** app and filter. Even in this variant the app still gets `secretRefs.SESSION_SECRET` (signs OAuth/SAML flow cookies) — the filter does not, since it verifies via the public JWK only. |
| Provider secrets (`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`, `IDP_CERT`) | `secrets.pickOrCreate()` | User-brought — pasted external OAuth client secret / SAML IdP cert, one per selected provider. |
| CDN resource | `cdn.resources.pick()` | the delivery domain to wire onto |

No Edge Storage step — the source repo is explicit that KV is not used for config (too expensive per read); none of the six templates declare a `data_type: "store"` param.

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

Google/Microsoft/Facebook each have a Redirect URI field, pre-filled on selection as `https://<cdn.cname><authPrefix>/callback/<provider>` (derived once the CDN resource and auth prefix are known — the auth app *is* the host, so the wizard already knows this value). The user can still edit it for a non-default callback path; the field is only left blank, and the corresponding `*_REDIRECT_URI` env var omitted, if they clear it. GitHub and SAML don't take a redirect URI param.

## Template config

Seven templates total (1 launch placeholder + 6 companions). The launch template carries `WIZARD_SOURCE_CONFIG` with all six companion ids:

```
WIZARD_SOURCE_CONFIG={"repo":"G-Core/FastEdge-Wizard-apps","path":"gh-pages/edge-sso","cdn":"jsdelivr","companionTemplateIds":[<6 companion template ids>]}
```

## Fixtures & e2e

`fixtures/fastedge/templates.json` holds all seven templates and their full param lists — enough for the mock host to render the wizard. Refresh live data with `/sync-wizard-fixtures`. The repo-root Playwright suite (`pnpm test:e2e`) screenshots the wizard in both themes and runs axe.

## SDK version

Pinned to `"@gcoredev/fastedge-wizard-sdk": "0.0.4"` (same as edge-totp) — see `context/INDEX.md` for the version notes. After a bump, re-validate fixtures (`npx fastedge-wizard-sdk dist --validate-only`); a schema change may need `/sync-wizard-fixtures` or a manual fixture edit.
