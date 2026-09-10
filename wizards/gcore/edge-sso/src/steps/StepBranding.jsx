import { OptionalPanels, WizardPanel } from '@gcore/wizard-step-kit/react';
import { Field } from '../components.jsx';

export function StepBranding({ f, set }) {
    return (
        <>
            <h2 tabIndex={-1}>Branding</h2>
            <p className="sso-lede">
                Customise the hosted login page. Leave unselected for the default unstyled
                Gcore page.
            </p>
            <OptionalPanels onChange={(sel) => set({ brandMode: sel[0] || 'none' })}>
                <WizardPanel value="custom" label="Add branding">
                    <Field label="Title" value={f.brandTitle}
                        onChange={(v) => set({ brandTitle: v })}
                        hint='Page <title> and <h1>. Default: "Sign in"' />
                    <Field label="Subtitle" value={f.brandSubtitle}
                        onChange={(v) => set({ brandSubtitle: v })}
                        hint='Subheading below the title. Default: "Choose a sign-in method"' />
                    <Field label="Logo URL" value={f.brandLogo}
                        onChange={(v) => set({ brandLogo: v })}
                        placeholder="https://example.com/logo.png" />
                    <Field label="Favicon URL" value={f.brandFavicon}
                        onChange={(v) => set({ brandFavicon: v })}
                        placeholder="https://example.com/favicon.ico" />
                    <Field label="Accent color" value={f.brandAccent}
                        onChange={(v) => set({ brandAccent: v })}
                        hint="Button/focus-ring colour. Default: #0066cc" />
                    <Field label="Background color" value={f.brandBackground}
                        onChange={(v) => set({ brandBackground: v })}
                        hint="Page background. Default: #f0f2f5" />
                    <Field label="Stylesheet URL (optional)" value={f.brandCssUrl}
                        onChange={(v) => set({ brandCssUrl: v })}
                        hint="Linked last — the deep-customization escape hatch. Overrides any built-in style." />
                </WizardPanel>
            </OptionalPanels>
        </>
    );
}
