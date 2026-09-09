---
name: wizard-publish
description: Set WIZARD_SOURCE_CONFIG on a wizard's launch FastEdge template via the Gcore API, wiring a merged wizard live in the portal. Run once a wizard has passed PR validation and merged to main (gh-pages has been published by CI).
---

Wire a merged wizard live by setting `WIZARD_SOURCE_CONFIG` on its launch template.

## When to use

Run this after the wizard's PR has merged and CI has published to `gh-pages` —
pointing a template at a wizard path that doesn't exist yet on `gh-pages` just
404s in the portal. Any contributor with Gcore portal access can use this to wire
up a wizard on their own account. For shared templates in the Gcore-managed account,
a Gcore team member runs it after verifying the wizard against a real portal
environment.

## Args

`[wizard-name] [launch-template-id]` — both optional; confirm interactively if
not supplied.

## Steps

### 0 — Confirm target before doing anything

Ask the user in a single message:

1. **Wizard**: which wizard under `wizards/` — any directory at any depth with
   its own `package.json` (skip `_template*`), e.g. `gcore/edge-totp` or
   `acme-corp-482913/onboarding-wizard`. If only one wizard lacks a wired
   template, suggest it but confirm rather than assume.
2. **Launch template id**: the id of the FastEdge template that will carry
   `WIZARD_SOURCE_CONFIG` and launch the wizard (this is the *anchor* template
   — for a multi-companion wizard it's the one the portal launches from, not
   necessarily a template that does real work; edge-sso's launch template is
   an inert placeholder).

If `wizards/<selected-wizard-path>/TARGET.md` exists, read it first and propose the launch
template id + companion ids parsed from its "Target templates" table (look for
a row whose Role column says **Launch**; all other listed real template ids
become `companionTemplateIds`). Show the parsed values and ask the user to
confirm or correct them — never proceed on a silent guess.

Do not proceed until wizard name and launch template id are confirmed.

### 1 — Fetch the current template

```
GET /fastedge/v1/template/{launch_template_id}
```

Keep `binary_id`, `name`, `short_descr`, `long_descr`, `owned`, `params` (default
`[]` if `null` — a placeholder template like edge-sso's 737 has no params yet).

### 2 — Build the WIZARD_SOURCE_CONFIG value

```json
{"repo":"G-Core/FastEdge-Wizard-apps","ref":"gh-pages","wizardDir":"<wizard-dir>","cdn":"jsdelivr"}
```

`ref` and `wizardDir` are separate fields, not a combined path string — a git
ref may itself contain a `/` (e.g. a branch like `feat/my-wizard`), which a
combined `"<ref>/<wizard-dir>"` string can't represent unambiguously.
`wizardDir` itself may contain `/` with no special handling needed — e.g.
`"<customer-folder>/<wizard-name>"` for a customer nesting wizards under a
subfolder.

If the wizard has companions (from TARGET.md or user input), add
`"companionTemplateIds":[<id>, ...]` to the same object — see
`context/INDEX.md` "Wiring a wizard to the portal" and the edge-totp precedent
in `context/wizards/edge-totp/DOCS.md`. Never invent companion ids; they must
come from TARGET.md or explicit user confirmation.

JSON-stringify this object — it becomes the `default_value` string inside the
param's `metadata`, which is itself a JSON string (matches the shape every
other param on this template returns from `GET`, e.g. `IDP_LABEL`'s
`metadata: "{\"default_value\":\"SSO\"}"`).

### 3 — Merge into params (idempotent)

Search `params` for an existing entry named `WIZARD_SOURCE_CONFIG`.

- **Found**: replace only its `metadata` field with the new value; leave
  `descr`/`mandatory`/every other param untouched.
- **Not found**: append a new param:
  ```json
  {
    "name": "WIZARD_SOURCE_CONFIG",
    "data_type": "string",
    "descr": "Wizard bridge source config (internal — set by /wizard-publish, do not edit manually).",
    "mandatory": false,
    "metadata": "<json-stringified { default_value: <json-stringified config> }>"
  }
  ```

This is what makes re-running idempotent — a second run overwrites the same
param in place instead of duplicating it.

### 4 — Confirm before writing

This mutates a **live, shared** FastEdge template visible in the real portal.
Show the exact before/after diff of the `params` array (or at minimum the
WIZARD_SOURCE_CONFIG param's old vs. new value) and get explicit confirmation
before the PUT — this is not a local, reversible edit.

### 5 — Apply

```
PUT /fastedge/v1/template/{launch_template_id}
```
Body (`UpdateTemplate`): the full object from Step 1 with the merged `params`
array from Step 3. `binary_id`, `name`, `owned` are required by the API even
though this change only touches `params` — send them unchanged.

### 6 — Verify

`GET /fastedge/v1/template/{launch_template_id}` again and confirm the
`WIZARD_SOURCE_CONFIG` param round-tripped with the expected value.

### 7 — Report

- Launch template id + name
- The exact `WIZARD_SOURCE_CONFIG` value written (repo/ref/wizardDir/cdn/companions)
- Whether this was a fresh param or an update to an existing one
- Reminder: the portal only resolves this once `gh-pages/<wizard-dir>` exists —
  if CI hasn't published yet, the template will 404 until it does.
