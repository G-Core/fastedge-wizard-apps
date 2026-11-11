# Wizard CSS Tokens

## Getting the full token list

The `wizard.css` file (tokens + classless element styles) is served live.
Fetch it to see current values — do not rely on any local copy, which will be stale:

```
https://wizard-app-4732724.fastedge.cdn.gc.onl/styles/v1/wizard.css
```

The token values are Gcore-maintained; this live URL is their source of truth for contributors. The catalog below is a vendored snapshot for quick reference.

---

## `--gc-wizard-*` token reference

These are **all** the tokens available inside a wizard iframe. Use only these —
the file contains no other custom properties.

### Text

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--gc-wizard-text` | `#161616` | `#ededed` | Primary body text |
| `--gc-wizard-text-muted` | `#868685` | `#928ea0` | Secondary / muted text, labels |

### Surfaces

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--gc-wizard-bg` | `#ffffff` | `#141316` | Page background |
| `--gc-wizard-surface` | `#e5e3e7` | `#1c1b1f` | Card / panel / `<pre>` background |
| `--gc-wizard-surface-input` | `#ffffff` | `#222027` | Form control background |
| `--gc-wizard-surface-code` | `#f5f4f4` | `#222027` | Inline `<code>` background |

### Borders

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--gc-wizard-border` | `#d2cfd5` | `#393740` | Standard border |
| `--gc-wizard-border-subtle` | `#ddd8e2` | `#504d5b` | `<pre>` / `<code>` borders |

### Brand

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--gc-wizard-brand` | `#ff4c00` | `#e45e24` | Brand accent (orange) |
| `--gc-wizard-brand-content` | `#6a6c6a` | `#1c1b1f` | Text on brand-coloured surfaces |

### Semantic states

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--gc-wizard-danger` | `#dc362e` | `#ff5367` | Error / destructive |
| `--gc-wizard-warning` | `#d17e33` | `#eec53b` | Warning |
| `--gc-wizard-success` | `#23ab0b` | `#2fc717` | Success text / border |
| `--gc-wizard-success-bg` | `#e9f9ec` | `#1a2819` | Success filled background |
| `--gc-wizard-info` | `#328ef8` | `#7bb8ff` | Informational |
| `--gc-wizard-link` | `#328ef8` | `#7bb8ff` | Hyperlink colour |

### Buttons

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--gc-wizard-btn-bg` | `#161616` | `#ededed` | Primary button background |
| `--gc-wizard-btn-text` | `#ffffff` | `#141316` | Primary button text |
| `--gc-wizard-btn-disabled-bg` | `#f5f4f4` | `#222027` | Disabled button background |
| `--gc-wizard-btn-disabled-text` | `#aea9b4` | `#77707e` | Disabled button text |

### Misc

| Token | Both themes | Purpose |
|-------|-------------|---------|
| `--gc-wizard-radius` | `8px` | Border radius for cards / inputs |
| `--gc-wizard-font` | Noto Sans, system-ui… | Font stack |

### Layout (set by the wizard, read by the base)

| Token | Default | Purpose |
|-------|---------|---------|
| `--gc-wizard-max-width` | `900px` (fallback, not defined in `wizard.css`) | Page width cap on `body`. A wizard with side-by-side panes sets `:root { --gc-wizard-max-width: 1280px; }` in its `styles.css`. Don't override `body { max-width }` directly — the portal stylesheet loads after yours and wins |
