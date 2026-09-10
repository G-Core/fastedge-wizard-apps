# _template-react

React 19 starter template for FastEdge wizards. Copy this directory as your starting point when building a wizard with React.

---

## Quick start

```bash
cp -r wizards/_template-react wizards/<your-wizard-name>
cd wizards/<your-wizard-name>
# Edit package.json: set "name" to your wizard name, update the SDK pin
pnpm install   # generates pnpm-lock.yaml — commit it
pnpm run dev   # mock host at http://localhost:9999
```

---

## How classless base CSS coexists with a React root

The WASM proxy (and the local dev server) automatically inject
`/styles/v1/wizard.css` into every wizard HTML response. That file provides:

- All `--gc-*` design tokens (both themes, both scopes)
- Classless base styles for bare semantic elements — `<button>`, `<input>`, `<h1>`, etc.

React renders into `<main id="root">`. The injected CSS targets the root `<body>`
and its element descendants, so every HTML element React renders is styled automatically.
**You do not need a reset, a `<link>` to wizard.css, or any base component library.**

Your `src/styles.css` should contain only wizard-specific layout and variant classes.
esbuild bundles it (including the step-kit import) into `dist/styles.css` — a single
self-contained file, no runtime fetch.

---

## React + `react-dom` are allowed; component libraries are not

`react` and `react-dom` are **rendering engines** — they produce semantic HTML that
wizard.css styles correctly. They are explicitly allowed.

**MUI, Ant Design, shadcn, Tailwind, and similar UI or utility libraries are forbidden.**
They ship their own styles that override wizard.css and bypass the token enforcement gate.
If it looks foreign in the screenshot diff, the PR fails.

See `CONTRIBUTING.md §3` and `context/INDEX.md` for the full policy.

---

## Step kit

This template uses `@gcore/wizard-step-kit` (at `packages/wizard-step-kit/`):

- `<gc-wizard-shell>` — stepped navigation shell with indicator, Back/Next/Finish
- `<gc-wizard-step>` — individual step container
- React wrappers: `WizardShell`, `WizardStep` (idiomatic props, no boilerplate)

See `packages/wizard-step-kit/README.md` for the full API.

The `file:../../packages/wizard-step-kit` dependency path is correct for this
template's own location, `wizards/_template-react/`. Real wizards nest one
level deeper — `wizards/<customer-name>-<account-id>/<name>/` (or
`wizards/gcore/<name>/`) — so **as soon as you copy this template, update the
path to `file:../../../packages/wizard-step-kit`** (one more `../`) and reinstall,
or `pnpm install` will fail to resolve it.

---

## Bundle size

React 19 + react-dom adds ~140 KB gzipped. The step-kit adds ~5 KB. Both are bundled
at build time; nothing is fetched at runtime (the proxy enforces `connect-src 'none'`).

Run `pnpm run build` to see esbuild's size output. The minified size is what ships.

---

## SDK pin

Update the `@gcoredev/fastedge-wizard-sdk` version in `package.json` to the latest tag
before opening a PR. Current tags are listed in `context/INDEX.md`.
