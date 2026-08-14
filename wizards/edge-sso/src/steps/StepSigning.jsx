import { useState } from 'react';
import { optional } from '@gcoredev/fastedge-wizard-sdk';
import { ResourceRow } from '@gcore/wizard-step-kit/react';

// Identity claims the auth-app will embed in the session token, beyond the
// always-included `sub`. Only meaningful when something downstream actually
// reads them: the header variant turns them into x-sso-* request headers,
// and the cookie variant's origin can decode them straight out of the JWT.
// gate-only strips the cookie and never injects headers, so a claims picker
// there would be a dead control — StepSigning hides it for that variant.
const CLAIM_OPTIONS = [
    { key: 'email', label: 'Email' },
    { key: 'name', label: 'Name' },
    { key: 'picture', label: 'Picture URL' },
    { key: 'given_name', label: 'Given name' },
    { key: 'family_name', label: 'Family name' },
];

// Session signing keys. Every variant needs SESSION_SECRET (signs the OAuth/SAML
// flow cookies; also the HS256 session token itself for gate-only/header). The
// cookie variant additionally needs an ES256 keypair for the session token, since
// its whole point is a verifiable-by-the-origin JWT rather than a shared secret.
export function StepSigning({ session, f, set }) {
    const [busy, setBusy] = useState('');

    const toggleClaim = (key) => {
        const claims = f.claims.includes(key) ? f.claims.filter((c) => c !== key) : [...f.claims, key];
        set({ claims });
    };

    async function genSecret() {
        setBusy('secret');
        try {
            const rs = await optional(() => session.fastedge.secrets.pickOrCreate({
                name: `${f.name}-session-secret`, comment: 'SSO session/flow signing secret', bytes: 32,
                label: 'Session secret',
            }));
            if (rs && rs.length) set({ sessionSecret: rs[0] });
        } catch (err) {
            console.error('session secret pick/generate failed:', err);
        } finally {
            setBusy('');
        }
    }

    async function genKeypair() {
        setBusy('keypair');
        try {
            const r = await optional(() => session.fastedge.secrets.generateKeypair({
                name: `${f.name}-session-key`, comment: 'ES256 session signing key (cookie variant)', algorithm: 'ES256',
            }));
            if (r) set({ signingKey: r });
        } catch (err) {
            console.error('session keypair generation failed:', err);
        } finally {
            setBusy('');
        }
    }

    return (
        <>
            <h2 tabIndex={-1}>Session signing</h2>
            <p className="sso-lede">
                This is what stops a visitor from forging their own "I'm signed in" session. Based
                on the <strong>{f.variant || '(no variant selected)'}</strong> variant you picked
                earlier: {f.variant === 'cookie'
                    ? <>your origin needs to verify the session cookie itself, so it can only hold
                        a <strong>public</strong> key (ES256, asymmetric) — a private key never
                        leaves this app.</>
                    : <>only the edge filter ever checks the session, so a single{' '}
                        <strong>shared secret</strong> (HS256, symmetric) both apps hold is
                        enough — nothing needs to be publishable.</>}
            </p>
            <ResourceRow title="Session secret"
                sub={f.variant === 'cookie'
                    ? 'Signs OAuth/SAML flow cookies (state/PKCE). App-only — not shared with the filter.'
                    : 'HS256, shared with the filter. Signs the session token itself.'}
                set={!!f.sessionSecret} value={f.sessionSecret?.name} onClear={() => set({ sessionSecret: null })}>
                <button onClick={genSecret} disabled={!!busy}>Select</button>
            </ResourceRow>
            {f.variant === 'cookie' && (
                <ResourceRow title="ES256 session signing keypair"
                    sub="Private key stored as a secret on the app; public JWK bound to both apps (the filter verifies with it, never signs)."
                    set={!!f.signingKey} value={f.signingKey?.name} onClear={() => set({ signingKey: null })}>
                    <button onClick={genKeypair} disabled={!!busy}>Generate keypair</button>
                </ResourceRow>
            )}
            {(f.variant === 'header' || f.variant === 'cookie') && (
                <>
                    <p className="sso-lede">
                        {f.variant === 'header'
                            ? <>Identity claims to embed in the token, beyond the always-included
                                <code>sub</code>. Each one you pick here reaches your origin as an{' '}
                                <code>x-sso-*</code> request header once the edge filter verifies the
                                session.</>
                            : <><code>sub</code> is always in the token. Pick any other claims you
                                want available when your origin decodes the cookie itself.</>}
                    </p>
                    <fieldset className="sso-checklist">
                        <span>Identity claims</span>
                        {CLAIM_OPTIONS.map(({ key, label }) => (
                            <label key={key} className="sso-checkbox">
                                <input type="checkbox" checked={f.claims.includes(key)}
                                    onChange={() => toggleClaim(key)} />
                                <span>{label}</span>
                            </label>
                        ))}
                        <span className="sso-hint">Sets SSO_CLAIMS on the auth-app. Leave all unchecked and only the subject id is available.</span>
                    </fieldset>
                </>
            )}
        </>
    );
}
