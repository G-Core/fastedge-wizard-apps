# html2md — HTML to Markdown Wizard

## What it is

The simplest possible wizard shape: a single `proxy-wasm` app, zero params, one CDN
resource picker, one deploy action, laid out as a 3-step `wizard-step-kit` shell
(Overview → CDN resource → Review) for chrome/UX consistency with the other wizards.
It deploys the `Transform HTML to Markdown` template and attaches it to a CDN resource
across all three of its required hooks (`on_request_headers`, `on_response_headers`,
`on_response_body`), per the template's own `instructions.md`.

It's the reference example for `deployment.plan`'s `cdnResourceFastedgeHandlers` —
resource-level FastEdge handler assignment (a PATCH on the CDN resource's own
`options.fastedge`), which is distinct from `newCdnRules[].fastedgeFilter` (scoped to
one path rule, headers-only). `cdnResourceFastedgeHandlers` is the only way to reach
`on_response_body` / `on_request_body`. See `docs/wizards/intent-catalog.md` in the
main `fastedge-frontend` repo for the full param/return shape.

## ⚠️ Blocked on portal host deployment

This wizard depends on `cdnResourceFastedgeHandlers`. The SDK (`0.0.5`) already includes
the field in its types and mock-host implementation, but the portal host change that
recognises the intent has **not yet been deployed**. Until that host deployment lands:

- Local `pnpm dev` (mock host) works — the mock host's `deployment.plan` stub handles
  the field.
- The real portal will not: `session.deployment.deploy()` will call an intent param
  the deployed host doesn't recognise yet.

No SDK version bump is needed — `0.0.5` is sufficient. The blocker is the host
deployment only.

## Tech stack

Vanilla JS (`wizards/_template` starter) + `@gcore/wizard-step-kit` for the
`<gc-wizard-shell>`/`<gc-wizard-step>` stepper, `<gc-resource-row>` for the CDN
resource picker, and `<gc-deploy-progress>` for the Review step's plan/progress/result
display — no framework needed for a wizard this small.

```
wizards/gcore/html2md/
  src/
    index.html
    main.js           ← the whole wizard: name → pick resource → deploy → finish
    styles.css
  fixtures/
    fastedge/templates.json  ← launch template, normalised id 1
  package.json
```

Never commit `dist/`/`release/` — CI builds and publishes.

## Build & dev

```bash
cd wizards/gcore/html2md
pnpm install
pnpm run dev          # builds + starts the SDK mock host on localhost
```

## Flow

1. **Overview** — `connect()` + `context.get()` identify the launch template (no
   companions); the user sets a deployment name (default `html2md`), used to name the
   created app (`<name>-filter`) rather than a forced `Date.now()` suffix.
2. **CDN resource** — `cdn.resources.pick()` via a `<gc-resource-row>`; the user picks
   the CDN resource to attach to.
3. **Review** — summarises the name + picked resource, then `deployment.deploy()`
   drives the shell's `finish` event: one `fastedgeApps` entry (`proxy-wasm`,
   `fromTemplateId: ctx.launchTemplateId`) plus `cdnResourceFastedgeHandlers` binding
   all three hooks to that app's ref, in one call (`onPlan`/`onProgress` feed a
   `<gc-deploy-progress>`). On `status: 'complete'` the shell's `finished` attribute
   flips the Next button to a single "Finished" button, which fires `wizard-finished`
   → `session.wizard.finish()`.

## Deliberately out of scope

- **Re-entry mode** (`ctx.launchTemplateId === null`, opened from an existing app) —
  the wizard bails with a message. Re-attaching an *existing* app to a different/
  additional CDN resource would be a legitimate future use case, but nothing asked
  for it yet; add it if a real need shows up.
- **Per-hook app overrides** — `cdnResourceFastedgeHandlers` supports binding a
  different app per hook (see intent-catalog.md), but this template is one app on
  all three hooks, so the wizard doesn't expose that generality in its UI.
