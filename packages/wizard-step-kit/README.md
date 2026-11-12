# @gcore/wizard-step-kit

Shared step UI for FastEdge wizards. Provides two light-DOM custom elements and
a thin React 19 wrapper. Zero framework required for vanilla use; zero boilerplate
for React use. Bundle with esbuild at wizard build time — never fetched at runtime.

---

## Elements

### `<gc-wizard-shell>` + `<gc-wizard-step>`

Stepped navigation shell. The shell reads `<gc-wizard-step>` children to build
the indicator, then toggles `hidden` on inactive steps — it **never recreates
child DOM**, so React (or any framework) keeps ownership.

```html
<gc-wizard-shell can-advance label-finish="Deploy">
  <gc-wizard-step title="App">
    <h3>Configure your app</h3>
    <!-- host-supplied content -->
  </gc-wizard-step>
  <gc-wizard-step title="Secrets">
    <h3>Add secrets</h3>
  </gc-wizard-step>
</gc-wizard-shell>
```

**Attributes**

| Attribute | Type | Description |
|---|---|---|
| `can-advance` | boolean | Enables the Next / Finish button |
| `error` | string | Validation message shown above nav |
| `label-back` | string | Back button label (default "Back") |
| `label-next` | string | Next button label (default "Next") |
| `label-finish` | string | Finish button label on last step (default "Finish") |

**Events** (all bubble)

| Event | Cancelable | `detail` |
|---|---|---|
| `navigate` | ✓ | `{ from: number, to: number, reason: 'next'|'back'|'goto' }` |
| `navigated` | — | `{ from: number, to: number }` |
| `finish` | — | — |

`preventDefault()` on `navigate` vetoes the transition (e.g. for async validation).

**Interaction model**

- `can-advance` controls whether Next/Finish is enabled. The host sets this from
  its own validation — the element never validates content.
- Last-step Next → `finish` (no `navigate` event).
- Indicator buttons dispatch `navigate` with `reason: 'goto'`.
- Focus moves to the first heading inside the newly active step.

---

### `<gc-optional-panels>` + `<gc-wizard-panel>`

Choose-one (or choose-many) group of option panels that reveal their content on
selection. Maps cleanly to "new app vs link existing app" flows.

```html
<gc-optional-panels>
  <gc-wizard-panel value="new" label="Create a new app">
    <p>A fresh FastEdge app will be created.</p>
  </gc-wizard-panel>
  <gc-wizard-panel value="existing" label="Link an existing app">
    <label>App ID <input type="text" /></label>
  </gc-wizard-panel>
</gc-optional-panels>
```

Add `multiple` to the container for checkbox behaviour (multi-select).

**Events**

| Event | `detail` |
|---|---|
| `selection-change` | `{ selected: string[] }` |

**Property:** `selected` (`string[]`) reads the selection, and setting it selects those panels
without firing `selection-change`. Use it to show a form loaded from an existing deployment. In React,
pass `<OptionalPanels value={[...]}>`.

---

### `<gc-resource-row>`

A managed-resource / picker row: title + sub on the left, host-supplied action
controls in the middle, and a "set / not set" status badge (with an optional
clear button) on the right. Maps to "pick or create a secret / store / CDN
resource" flows.

```html
<gc-resource-row title="Session key" sub="HS256, shared" set clearable>
  <button>Generate</button>
</gc-resource-row>
```

**Attributes**

| Attribute | Type | Description |
|---|---|---|
| `title` | string | Row title — a fixed purpose label; don't overwrite it with a picked resource's name |
| `sub` | string | Secondary line under the title |
| `value` | string | Resolved resource's own name once set (e.g. the picked secret's name) — a third, truncating line; never put this in the badge, which is fixed-width |
| `set` | boolean | Resource is set → badge reads `label-set`, styled "success" |
| `clearable` | boolean | Show a clear (×) button in the badge while `set` |
| `label-set` | string | Badge text when set (default "set") |
| `label-unset` | string | Badge text when unset (default "not set") |
| `label-clear` | string | `aria-label` for the × button (default "Clear") |
| `locked` | boolean | Can't change (e.g. fixed on Re-entry): compact row, neutral "🔒 locked" badge, no clear, actions hidden, `aria-disabled` |
| `reason` | string | Why it's locked — replaces `sub` while `locked` |
| `label-locked` | string | Badge text when locked (default "locked") |

**Events**

| Event | `detail` |
|---|---|
| `clear` | — (the × button was clicked) |

The row builds its own title/sub/badge but never touches the host-supplied
action children — they stay put, so a framework keeps DOM ownership.

---

### `<gc-locked>`

Marks the fields inside it as locked and shows why, matching a locked
`<gc-resource-row>`. Use it for anything a wizard can't change on Re-entry.

```html
<gc-locked reason="Fixed after the first deploy.">
  <label>Auth prefix <input value="/auth/totp" disabled></label>
</gc-locked>
```

It appends a `🔒 <reason>` line and nothing else: **disable the fields
yourself**, so a framework keeps owning them. With no `reason` it renders its
children unchanged, so you can wrap a field unconditionally. The portal's base
`wizard.css` styles `:disabled` inputs (dashed border, no surface, muted text).

**Where the reasons come from.** Fixed fields are declared in the SDK field map
(`field.fixed(reason, …)`); `fields.locks(current)` returns `{ field: reason }`
in Re-entry and `{}` in template mode, and `fields.save` refuses to change them.
Host-fixed values (app name, CDN resource) aren't fields: lock those with your
own reason when `current` is set.

---

### `<gc-deploy-progress>`

Display-only panel for a deployment lifecycle. Unlike the shell/row it is
**data-driven** (no slots, no events): you drive `session.deployment.deploy()`
and feed the resulting state in via the `state` property.

```js
document.querySelector('gc-deploy-progress').state = {
  status,   // 'idle' | 'planning' | 'applying' | 'done' | 'error'
  plan,     // DeploymentPlan | null      — { summary, steps[], warnings[] }
  progress, // DeploymentProgressEvent[]  — [{ step, total, describe }]
  result,   // DeploymentApplyResult | null
  error,    // string | null
};
```

It renders the plan summary + steps + warnings, live `[n/total]` progress lines,
any error, and the result (created apps / stores / origins / rules, with the
final `complete` / `partial` / `rolled_back` status). It owns all its DOM and
calls nothing on the SDK.

---

## Vanilla JS usage

```js
import '@gcore/wizard-step-kit'; // registers both elements

const shell = document.querySelector('gc-wizard-shell');
shell.addEventListener('navigate', e => {
    // e.detail.from, e.detail.to, e.detail.reason
    // call e.preventDefault() to veto
});
shell.addEventListener('finish', () => { /* deploy */ });

// Update can-advance from validation
shell.toggleAttribute('can-advance', isValid);
shell.setAttribute('error', validationMessage); // or removeAttribute

document.querySelector('gc-optional-panels').addEventListener('selection-change', e => {
    console.log(e.detail.selected); // ['new'] or ['cdn', 'waf']
});
```

---

## React 19 usage

The React wrapper handles `ref` + `addEventListener` internally. Consumers use
idiomatic React props.

```jsx
import '@gcore/wizard-step-kit';
import { WizardShell, WizardStep, OptionalPanels, WizardPanel, ResourceRow, DeployProgress, Locked } from '@gcore/wizard-step-kit/react';

function MyWizard() {
    const [step, setStep] = React.useState(0);
    const [choice, setChoice] = React.useState([]);

    return (
        <WizardShell
            canAdvance={choice.length > 0}
            onNavigate={e => console.log('going to', e.detail.to)}
            onFinish={() => deploy()}
            labels={{ finish: 'Deploy' }}
        >
            <WizardStep title="Choose app">
                <OptionalPanels onChange={setChoice}>
                    <WizardPanel value="new" label="Create new">...</WizardPanel>
                    <WizardPanel value="existing" label="Link existing">...</WizardPanel>
                </OptionalPanels>
            </WizardStep>
            <WizardStep title="Secrets">...</WizardStep>
        </WizardShell>
    );
}
```

**React event note:** The wrappers attach `addEventListener` in a `useEffect` rather
than relying on React's synthetic event system. This is intentional — custom element
events don't bubble through React's event delegation layer consistently. The ref +
`addEventListener` pattern lives once inside the wrapper; wizard code never sees it.

---

## Styles

The kit's CSS (`src/styles.css`) uses only `--gc-wizard-*` tokens (see
`context/INDEX.md` for the reference table). It is automatically covered by the
`lint:css` check. Import or bundle it alongside the element JS:

```js
import '@gcore/wizard-step-kit/styles'; // via bundler CSS import support
// or copy src/styles.css to your wizard's styles.css
```

The base `wizard.css` (auto-injected by the WASM proxy and dev server) provides
button, input, and body defaults — do not duplicate those.

---

## Build

```bash
# From the fastedge-wizard-apps workspace root:
pnpm install          # installs wizard-step-kit devDeps (esbuild, react)
pnpm -r --filter './packages/**' run build   # builds the example page into dist/
```

The `dist/` directory is gitignored — CI builds it. Source files in `src/` and
`react/` are what consumer wizards import and bundle.
