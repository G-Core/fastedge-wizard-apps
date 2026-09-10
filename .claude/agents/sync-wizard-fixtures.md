---
name: sync-wizard-fixtures
description: Fetch live Gcore data, present it for selection, then write chosen fixtures into a wizard's fixtures/ directory. Covers templates, apps, secrets, KV stores, CDN resources, CDN origin groups, and CDN rules. Fudges IDs so real resource IDs are not committed to source control.
---

Sync live Gcore API data into wizard fixture files, with interactive selection.

## When to use

Run after account data changes or when setting up a new wizard, to give the mock host realistic stub data.

If fixture schema validation fails at the end, it means the installed SDK schemas have drifted from the live API. Run `/check-api-drift` in the `fastedge-wizard-sdk` repo to update `types.ts`, then bump the SDK pin and reinstall before re-running this skill.

## Args

`[wizard-name]` — optional; you MUST confirm it interactively if not supplied.

## Steps

### 0 — Confirm target before doing anything

**Always run this step first, before any API calls.**

Ask the user two things in a single message:

1. **Wizard**: List every wizard under `wizards/` — any directory at any depth
   with its own `package.json` (skip `_template*`), e.g. `gcore/edge-totp` or
   `acme-corp-482913/onboarding-wizard` — and ask which one to update. If only
   one exists, confirm rather than silently assuming.

2. **Resource types**: Ask which fixture types to sync. Present all seven options and let them pick any subset:

   ```
   Which resource types do you want to sync? (pick any combination)
     a) templates       → fixtures/fastedge/templates.json
     b) apps            → fixtures/fastedge/apps.json
     c) secrets         → fixtures/fastedge/secrets.json
     d) kv-stores       → fixtures/fastedge/stores.json
     e) cdn-resources   → fixtures/cdn/resources.json
     f) cdn-origins     → fixtures/cdn/origins.json
     g) cdn-rules       → fixtures/cdn/rules.json
                          (requires a CDN resource to pull rules from — you will be asked
                           which resource if cdn-resources is not also selected)

   ("all", "a b c", "just templates", "all except cdn", etc.)
   ```

Do not proceed until both are confirmed.

### 1 — Fetch available data from the Gcore API

Fetch only the resource types the user selected. Run all selected fetches in parallel where possible.

**Templates** — `GET /fastedge/v1/template?limit=200`
Response: `{ count, templates: TemplateShort[] }` where each has `{ id, name, short_descr, api_type, owned }`.

**Apps** — `GET /fastedge/v1/apps?limit=200`
Response: `{ count, apps: AppShort[] }` where each has `{ id, name, api_type, status, url, template }`.

**Secrets** — `GET /fastedge/v1/secrets?limit=200`
Response: `{ count, secrets: SecretShort[] }` where each has `{ id, name, app_count }`.

**KV stores** — `GET /fastedge/v1/kv?limit=200`
Response: `{ count, stores: KvStoreShort[] }` where each has `{ id, name, comment? }`.

**CDN resources** — `GET /cdn/resources?limit=200`
Response: `{ results: CdnResourceShort[] }` where each has `{ id, cname, description?, status }`.
Note: this is the CDN API, not the FastEdge API.
Fetch this even if only `cdn-rules` was selected (needed to identify which resource to pull rules from).

**CDN origin groups** — `GET /cdn/origin_groups?limit=200`
Response: each item has `{ id, name }`.
Note: CDN API.

**CDN rules** — requires a CDN resource ID; do NOT fetch in this step.
Rules are fetched after the user selects a CDN resource in Step 2.

### 2 — Present selection menus

Display a numbered list for each selected resource type and ask which items to include in the fixtures.

Format each list clearly. For templates, show owned vs shared:

```
Available templates (26):
  Public / shared:
    1.  Geolocation-based redirect  [wasi-http]  — Redirect to the server configured for the user's country
    2.  GitHub artifact             [wasi-http]  — Get GitHub Actions artifact
    ...
  Owned by this account:
    12. CDN Debug                   [wasi-http]  — CDN Debugging utility
    13. shop-front                  [wasi-http]  — Basic ShopFront static site
    ...

Which templates? (numbers, names, "all", "none", or describe)
```

For apps, show status translated (0=draft, 1=enabled, 2=disabled) and the template name if present:

```
Available apps (N):
    1. my-app-name  [wasi-http, enabled]  — from template: CDN Debug
    ...

Which apps? ("all", "none", numbers, names, or describe)
```

For secrets:

```
Available secrets (N):
    1. MY_API_KEY        (used by 2 apps)
    2. SIGNING_SECRET    (used by 1 app)
    ...

Which secrets? ("all", "none", numbers, or names)
```

For KV stores:

```
Available KV stores (N):
    1. session-store      — User session data
    2. rate-limit-store   — Per-IP counters
    ...

Which stores? ("all", "none", numbers, or names)
```

For CDN resources (shown whenever `cdn-resources` OR `cdn-rules` was selected):

```
Available CDN resources (N):
    1. cdn.example.com      [active]   — Main site delivery domain
    2. assets.example.com   [active]   — Static asset CDN
    ...

Which CDN resources? ("all", "none", numbers, or cnames)
```

If only `cdn-rules` was selected (not `cdn-resources`), add a note:
> These won't be written to `resources.json` — they're only used to identify which resource(s) to pull rules from.

For CDN origin groups:

```
Available CDN origin groups (N):
    1. geo-redirect-origin
    2. jwt-filter-origin
    ...

Which origin groups? ("all", "none", numbers, or names)
```

For CDN rules — once CDN resource selection is confirmed, fetch rules for each selected resource (`GET /cdn/resources/{resourceId}/rules`), then present a combined list:

```
Rules across selected CDN resource(s) (N total):
    1. auth-rule          [cdn.example.com]  — ^/auth  (weight 1, fastedge filter: on_request_headers)
    2. geo-rule           [cdn.example.com]  — ^/      (weight 5, origin group: 500001)
    ...

Which rules? ("all", "none", numbers, or names)
```

Accept flexible input — match by name, number, description, or the user's own words. If intent is ambiguous, ask for clarification before proceeding. Ask all active menus in a single message where possible (CDN rules menu is presented after CDN resource selection is confirmed).

### 3 — Fetch full details for selected items

For each **selected template**, fetch full details to get `binary_id` and `params`:
```
GET /fastedge/v1/template/{id}
```
Response has `binary_id`, `params[]`, `name`, `short_descr`, `long_descr`, `api_type` but NOT `id` — merge `id` from the list call.

Build the full template object:
```json
{
  "id": <from list>,
  "name": <name>,
  "short_descr": <default "">,
  "long_descr": <default "">,
  "api_type": <api_type>,
  "binary_id": <from detail>,
  "params": <from detail, default []>
}
```

Each param: keep only `{ name, data_type, descr, mandatory }` plus optional `metadata`. Drop any extra fields.

For each **selected app**, fetch full details to get `env` and `secrets`:
```
GET /fastedge/v1/apps/{id}
```

Build the app object:
```json
{
  "id": <from list>,
  "name": <name>,
  "api_type": <api_type>,
  "status": <status>,
  "url": <url, default "">,
  "template": <template id or null>,
  "env": <from detail, default {}>,
  "secrets": <convert secrets Record to [{ id, name }], default []>
}
```

The API returns `secrets` as `Record<string, { id, name, comment }>` on the full App — convert to `[{ id, name }, ...]`.

**Secrets**, **KV stores**, **CDN resources**, **CDN origin groups**, and **CDN rules** need no detail fetch — the list shape is sufficient.

KV store object: `{ id, name, comment? }` — omit `comment` if absent.
CDN resource object: `{ id, cname, description?, status }` — omit `description` if absent.
CDN origin group object: `{ id, name }`.
CDN rule object: extract from the raw rule response —
```json
{
  "id": <id>,
  "name": <name>,
  "rule": <rule regex>,
  "weight": <weight, omit if absent>,
  "originGroupId": <originGroup field value, omit if absent>,
  "fastedgeFilter": <extracted from options.fastedge, omit if absent>
}
```
For `fastedgeFilter`: check which hook key is present under `options.fastedge` (`on_request_headers` or `on_response_headers`), then build `{ appId: Number(hookConfig.app_id), hook }`. Omit the field entirely if `options.fastedge` is absent.

### 4 — Fudge IDs

Replace all real resource IDs with fudged integers to avoid committing actual account IDs to source control.

Build maps for each selected type:
- `templateIdMap`: real_id → normalised id, sequential from 1 ordered by position
  in the selected list: first template → 1, second → 2, third → 3, up to 19.
  The mock host's `context.get()` automatically derives `companionTemplateIds` from
  all fixture templates with id 2–19, so the order here determines which templates
  are treated as companions. **List the launch template first.**
  Templates you did not select (ids ≥ 20 in the live account) are treated as regular
  platform templates and do not need normalising.
- `appIdMap`: real_id → 1, 2, 3...
- `secretIdMap`: real_id → 1, 2, 3...
- `storeIdMap`: real_id → 1, 2, 3...
- `cdnResourceIdMap`: real_id → 12000001, 12000002... (large ints match CDN ID conventions)
- `originIdMap`: real_id → 500001, 500002...
- `ruleIdMap`: real_id → 600001, 600002...

Apply maps — cross-references are re-linked so the fixture set stays internally consistent:
- Each template: `id = templateIdMap[id]`
- Each app: `id = appIdMap[id]`, `template = templateIdMap[template] ?? null`, `secrets[].id = secretIdMap[id]`
- Each secret: `id = secretIdMap[id]`
- Each KV store: `id = storeIdMap[id]`
- Each CDN resource: `id = cdnResourceIdMap[id]`
- Each CDN origin group: `id = originIdMap[id]`
- Each CDN rule: `id = ruleIdMap[id]`, and if present:
  - `originGroupId = originIdMap[originGroupId]` (only if that origin group was selected; otherwise leave as-is and warn)
  - `fastedgeFilter.appId = appIdMap[fastedgeFilter.appId]` (only if that app was selected; otherwise leave as-is and warn)

### 5 — Validate against SDK schemas

Load `fixtureSchemas` from the wizard's installed SDK:
`wizards/<name>/node_modules/@gcoredev/fastedge-wizard-sdk/dist/schemas.js`

The schema keys use slash-path format — access with bracket notation. Validate only selected types that have items:
- `fixtureSchemas['fastedge/templates'].parse(selectedTemplates)`
- `fixtureSchemas['fastedge/apps'].parse(selectedApps)`
- `fixtureSchemas['fastedge/secrets'].parse(selectedSecrets)`
- `fixtureSchemas['fastedge/stores'].parse(selectedStores)`
- `fixtureSchemas['cdn/resources'].parse(selectedCdnResources)`
- `fixtureSchemas['cdn/origins'].parse(selectedOrigins)`
- `fixtureSchemas['cdn/rules'].parse(selectedRules)`

If any parse fails, report the Zod error and stop — do NOT write files. Suggest running `/check-api-drift` in `fastedge-wizard-sdk`.

### 6 — Write files

Write only the resource types that were selected (create directories as needed):

FastEdge fixtures → `wizards/<selected-wizard-path>/fixtures/fastedge/`:
- `templates.json` — if templates were selected
- `apps.json` — if apps were selected
- `secrets.json` — if secrets were selected
- `stores.json` — if KV stores were selected

CDN fixtures → `wizards/<selected-wizard-path>/fixtures/cdn/`:
- `resources.json` — only if `cdn-resources` was explicitly selected (not written if cdn-resources was fetched solely to identify rule sources)
- `origins.json` — if cdn-origins was selected
- `rules.json` — if cdn-rules was selected (flat array across all selected CDN resources)

All files: pretty-printed JSON arrays.

Report: how many of each type were written, and remind the user that IDs have been fudged (real IDs are not in these files).
