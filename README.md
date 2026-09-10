# FastEdge Wizard Apps

A monorepo of **FastEdge setup wizards** — small front-end apps that guide a user through configuring a FastEdge feature (deploying apps, wiring CDN rules, creating secrets/stores) step by step.

A wizard runs inside the Gcore portal in a **hardened, sandboxed iframe**. It never holds a Gcore API credential: it talks to the portal over a narrow `postMessage` **intent bridge**, and the portal makes the Gcore API calls on its behalf. A wizard is just static HTML + JS (optionally a framework as a renderer) — no backend of its own.

## Quick start — a running wizard in ~1 minute

Copy a starter template and run it against the SDK's local **mock host** (no portal, no account needed):

```bash
cp -r wizards/_template wizards/my-wizard      # or _template-react for React
cd wizards/my-wizard
pnpm install
pnpm run dev                                    # builds + serves the mock host on localhost
```

Open the printed URL — you get the wizard framed by a stub portal with fake API data, so you can build and iterate the whole flow offline. Edit `src/main.js` (or `.jsx`), rebuild, refresh.

Before opening a PR, move your wizard under `wizards/<customer-name>-<account-id>/<wizard-name>/` — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the naming convention and why the account id matters.

Starters and examples under `wizards/`:

| Wizard             | Use it as                                                                |
| ------------------ | ------------------------------------------------------------------------ |
| `_template`        | Vanilla HTML/JS starter (esbuild) — **start here**                       |
| `_template-react`  | React 19 starter (JSX via esbuild)                                       |
| `_example`         | Minimal read-only demo (`context.get`, `templates.list`)                 |
| `_example-intents` | Exercises the full intent surface (apps, secrets, stores, CDN, deploy)   |
| `edge-totp`        | The canonical real wizard — two apps + CDN wiring + eager secrets/stores |

## Repo layout

```
wizards/<customer-name>-<account-id>/<name>/  your wizard — commit src/, package.json + lockfile (and fixtures/ if used); CI builds it
  _template*/         starter skeletons (not deployed)
packages/             shared build-time code (e.g. @gcore/wizard-step-kit); bundled in, never fetched at runtime
scripts/              build-all, assemble, token check, SDK bump
e2e/                  Playwright visual + axe gates (auto-discovers every wizard)
context/              discovery hub for deep reference — read context/INDEX.md
```

`main` holds **source only**. CI builds each wizard and publishes to the `gh-pages` branch, which jsDelivr serves; the portal proxies that through a hardened WASM app. Never commit `dist/` or `release/`.

## Where to go next

| I want to…                                                                                                    | Read                                                                       |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Build and submit** a wizard (the full flow: study a template, pick intents, style rules, PR gates, go-live) | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                       |
| Look up the **SDK API** (`connect`, intents, events, errors)                                                  | [`G-Core/fastedge-wizard-sdk`](https://github.com/G-Core/fastedge-wizard-sdk) |
| Deep reference — proxy contract, token subset, template-param constraints, wizard registry                    | [`context/INDEX.md`](context/INDEX.md)                                     |

Building with an AI agent: read [`CLAUDE.md`](CLAUDE.md) first, then `context/INDEX.md`.
