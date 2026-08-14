import { OptionalPanels, WizardPanel } from '@gcore/wizard-step-kit/react';
import { Note, Field } from '../components.jsx';

export function StepRouting({ f, set }) {
    return (
        <>
            <h2 tabIndex={-1}>Routing &amp; session</h2>
            <p className="sso-lede">
                These fields all describe one thing — the SSO session your visitor gets after
                signing in: where the auth app lives (auth prefix), which site is allowed to
                accept that session (audience), where they land if they&apos;re not signed in
                (login page), and where they&apos;re allowed to be sent back to afterwards
                (allowed redirect origins). They must be <strong>identical</strong> on both apps —
                the wizard binds them once to both.
            </p>
            <Field
                label="Auth path prefix"
                value={f.authPrefix}
                onChange={(v) => set({ authPrefix: v })}
                hint="Where the auth app is mounted. The CDN path rule and the filter bypass both use this. Default: /auth"
            />
            <h3>Protection scope</h3>
            <p className="sso-lede">
                Which paths on this CDN resource require a valid session. The filter always
                bypasses the auth prefix above, whichever scope you choose.
            </p>
            <OptionalPanels onChange={(sel) => set({ protectionScope: sel[0] || '' })}>
                <WizardPanel value="all" label="Protect the entire site">
                    <p>Every path on this CDN resource requires a valid session. Choose this only
                        if the whole site sits behind SSO.</p>
                </WizardPanel>
                <WizardPanel value="paths" label="Protect specific paths">
                    <p>Only the paths listed below require a valid session — everything else on
                        this CDN resource is unaffected.</p>
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
                label="SSO audience (required)"
                value={f.audience}
                onChange={(v) => set({ audience: v })}
                placeholder="https://app.example.com"
                hint="The aud claim baked into the session token. The filter refuses every session unless this is set and matches."
            />
            <Note kind="danger">
                <strong>Fail-closed:</strong> leaving the audience blank makes the filter reject{' '}
                <em>all</em> traffic. Use the protected site&apos;s public URL.
            </Note>
            <Field
                label="Session cookie name"
                value={f.cookie}
                onChange={(v) => set({ cookie: v })}
                hint="Change only if sso_session collides with an existing cookie. Default: sso_session"
            />
            <Field
                label="Issuer (optional)"
                value={f.issuer}
                onChange={(v) => set({ issuer: v })}
                hint="Extra iss check. If set, it is applied to both apps. Leave blank to skip."
            />
            <Field
                label="Canonical host (optional)"
                value={f.canonicalHost}
                onChange={(v) => set({ canonicalHost: v })}
                placeholder="shop.example.com"
                hint="Any request on the bare FastEdge origin URL 301s here first — keeps IdP callback URLs stable."
            />
            <Field
                label="Allowed redirect origins (optional)"
                value={f.allowedOrigins}
                onChange={(v) => set({ allowedOrigins: v })}
                placeholder="https://shop.example.com,https://admin.example.com"
                hint="Comma list of absolute origins allowed as ?redirect= targets. Leave blank for relative-only (safe default) — allowing arbitrary origins here lets an attacker craft a login link that sends a signed-in user to a lookalike site (open redirect)."
            />
            <Field
                label="Login page URL (optional, filter only)"
                value={f.loginUrl}
                onChange={(v) => set({ loginUrl: v })}
                placeholder="https://shop.example.com/my-login"
                hint="Redirect target for unauthenticated users. Blank uses the built-in hosted login page at {authPrefix}/."
            />
        </>
    );
}
