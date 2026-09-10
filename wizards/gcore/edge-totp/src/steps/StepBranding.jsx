import { OptionalPanels, WizardPanel } from '@gcore/wizard-step-kit/react';
import { Field } from '../components.jsx';

export function StepBranding({ f, set }) {
    return (
        <>
            <h2 tabIndex={-1}>Branding</h2>
            <p className="totp-lede">
                Customise the hosted OTP challenge and enrolment pages. Leave unselected for
                the default unstyled Gcore pages.
            </p>
            <OptionalPanels onChange={(sel) => set({ brandMode: sel[0] || 'none' })}>
                <WizardPanel value="custom" label="Add branding">
                    <Field label="Brand name" value={f.brandName}
                        onChange={(v) => set({ brandName: v })}
                        hint="Appended to the page title and used as the logo alt text." />
                    <Field label="Logo URL" value={f.brandLogo}
                        onChange={(v) => set({ brandLogo: v })}
                        placeholder="https://example.com/logo.png"
                        hint="Shown above the OTP form. Recommended max: 48×180 px." />
                    <Field label="Favicon URL" value={f.brandFavicon}
                        onChange={(v) => set({ brandFavicon: v })}
                        placeholder="https://example.com/favicon.ico"
                        hint='Injected as <link rel="icon"> on the hosted pages.' />
                    <Field label="Button color" value={f.brandColor}
                        onChange={(v) => set({ brandColor: v })}
                        hint="Button background and input focus-ring colour. Default: #0066cc" />
                    <Field label="Button hover color" value={f.brandHover}
                        onChange={(v) => set({ brandHover: v })}
                        hint="Explicit hover background. If unset, the button dims slightly on hover." />
                </WizardPanel>
            </OptionalPanels>
        </>
    );
}
