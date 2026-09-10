# edge-totp

A wizard that adds **TOTP (authenticator-app) multi-factor authentication** in
front of an existing login, enforced at the CDN edge. It deploys two FastEdge
apps onto a single CDN resource and wires the routing so the MFA challenge and
enforcement happen before requests reach the customer origin.

## What it deploys

| Resource | Role |
|----------|------|
| **TOTP - MFA Enforcement Filter** (`proxy-wasm`) | Verifies the `mfa_session` JWT cookie on every protected request. Fail-closed: rejects everything unless a valid, correctly-audienced session is present. |
| **TOTP - Challenge-Verify App** (`wasi-http`) | Hosts the OTP enrolment/verification pages and issues the signed `mfa_session` cookie. |
| **Edge Storage** | Holds per-user TOTP seeds. |
| **CDN origin + rules** | One origin for the app, a route sending `AUTH_PREFIX` paths to it, and the filter attached in front of everything else. |

Both apps must share **one CDN host** so the `mfa_session` cookie is first-party,
and they must agree on the shared values (`MFA_SESSION_KEY`, `MFA_AUDIENCE`,
`AUTH_PREFIX`, `MFA_SESSION_COOKIE`) — the wizard keeps those in sync for you.

The two templates are identified at runtime by `api_type` (from `launchTemplateId`
+ `companionTemplateIds` in `context.get()`) — **never** by hard-coded template id.

## Steps & required inputs

| # | Step | Required to advance |
|---|------|---------------------|
| 1 | Overview | Deployment name (used to name the apps, origin, and rules) |
| 2 | CDN resource | Pick the CDN resource the apps sit behind |
| 3 | Routing & tokens | `MFA_AUDIENCE` (fail-closed) + an `AUTH_PREFIX` starting with `/` |
| 4 | Edge Storage | Pick or create the Edge Storage instance for TOTP seeds |
| 5 | Secrets | Four secrets: session key, handoff key, enrol API key, Gcore API token |
| 6 | Profile | Profile A or B (see below) |
| 7 | TOTP settings | Optional — issuer, digits, period, algorithm, drift |
| 8 | Branding | Optional — brand name, logo, favicon, button colours |
| 9 | Review | Deploy (plan → apply, with progress) |

### Profiles A / B

- **Profile A** — the app both issues and consumes the session cookie. No extra keys.
- **Profile B** — a proof-of-possession keypair is generated so a separate origin
  can verify the session independently; adds `MFA_PROOF_*` env + the proof signing
  secret to the deployment.

Steps 7 and 8 are entirely optional; leaving them on "default" ships the template
defaults (see `TARGET.md` for the full param tables and defaults).

## Run locally

```bash
cd wizards/gcore/edge-totp
pnpm install
pnpm run dev      # builds and starts the mock host on http://localhost:9999
```

The mock host stubs the bridge and serves fixtures from `fixtures/fastedge/`
(e.g. `templates.json`), so you can step through the whole flow without a live
portal. Use `fixtures/fastedge/new-secrets.json` / `new-stores.json` to seed
realistic names for the pick-or-create dialogs.

## Notes

- Built with React 19 + `@gcore/wizard-step-kit` (custom-element step shell).
  UI/utility libraries (MUI, Tailwind, etc.) are forbidden — see `CONTRIBUTING.md`.
- SDK dependency is `@gcoredev/fastedge-wizard-sdk`. This is a production wizard,
  so pin it to a specific published version (`node scripts/bump-sdk.mjs <version>`
  from the repo root) rather than tracking `"latest"`.
