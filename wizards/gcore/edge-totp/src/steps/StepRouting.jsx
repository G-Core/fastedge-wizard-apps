import { OptionalPanels, WizardPanel } from '@gcore/wizard-step-kit/react';
import { Note, Field } from '../components.jsx';

export function StepRouting({ f, set }) {
    return (
        <>
            <h2 tabIndex={-1}>Routing &amp; token binding</h2>
            <p className="totp-lede">
                These fields all describe one thing — the MFA session your visitor gets after a
                successful challenge: where the challenge page lives (auth prefix), which site is
                allowed to accept that session (audience), where a browser should land to start a
                challenge (Login URL), and an optional extra check (issuer). They must be
                <strong> identical</strong> on both apps — the wizard binds them once to both.
            </p>
            <Field
                label="Auth path prefix"
                value={f.authPrefix}
                onChange={(v) => set({ authPrefix: v })}
                hint="Where the challenge/verify app is mounted. The CDN path rule and the filter bypass both use this. Default: /auth/totp"
            />
            <h3>Protection scope</h3>
            <p className="totp-lede">
                Which paths on this CDN resource require MFA. The filter always bypasses the auth
                prefix above and <code>/health</code>, whichever scope you choose.
            </p>
            <OptionalPanels onChange={(sel) => set({ protectionScope: sel[0] || '' })}>
                <WizardPanel value="all" label="Protect the entire site">
                    <p>Every path on this CDN resource requires a valid <code>mfa_session</code>. Choose
                        this only if the whole site sits behind MFA.</p>
                </WizardPanel>
                <WizardPanel value="paths" label="Protect specific paths">
                    <p>Only the paths listed below require MFA — everything else on this CDN resource
                        is unaffected.</p>
                    <Field
                        label="Protected paths"
                        value={f.protectedPaths}
                        onChange={(v) => set({ protectedPaths: v })}
                        placeholder="/checkout, /account"
                        hint="Comma-separated path prefixes, e.g. /checkout, /account. Each becomes its own CDN rule."
                    />
                </WizardPanel>
            </OptionalPanels>
            {!f.protectionScope && (
                <Note kind="danger">Choose a protection scope before continuing — there is no default.</Note>
            )}
            <Field
                label="MFA audience (required)"
                value={f.audience}
                onChange={(v) => set({ audience: v })}
                placeholder="https://app.example.com"
                hint="The aud claim baked into the session token. The filter refuses every session unless this is set and matches."
            />
            <Note kind="danger">
                <strong>Fail-closed:</strong> the audience is marked optional on the app but is mandatory on the filter.
                Leaving it blank makes the filter reject <em>all</em> traffic. Use the protected site's public URL.
            </Note>
            <Field
                label="Session cookie name"
                value={f.cookie}
                onChange={(v) => set({ cookie: v })}
                hint="Change only if mfa_session collides with an existing cookie. Default: mfa_session"
            />
            <Field
                label="Issuer (optional)"
                value={f.issuer}
                onChange={(v) => set({ issuer: v })}
                hint="Extra iss check. If set, it is applied to both apps. Leave blank to skip."
            />
            <Field
                label="Login URL (optional, filter only)"
                value={f.loginUrl}
                onChange={(v) => set({ loginUrl: v })}
                placeholder="https://app.example.com/login/mfa"
                hint="A page on YOUR origin that starts the challenge — not the totp-app URL itself. Leave
                    blank only if every protected path is an API a browser never hits directly."
            />
            {!f.loginUrl && (
                <Note kind="danger">
                    <strong>No Login URL set:</strong> anyone hitting a protected path without a
                    session will see a bare <code>401 &quot;MFA required&quot;</code> response, not a
                    challenge screen. For a checkout page, account area, or anything a person opens in
                    a browser, this is almost never what you want — set this before deploying.
                </Note>
            )}
        </>
    );
}
