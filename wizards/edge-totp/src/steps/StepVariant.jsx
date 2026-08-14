import { useState } from 'react';
import { OptionalPanels, WizardPanel } from '@gcore/wizard-step-kit/react';
import { optional } from '@gcoredev/fastedge-wizard-sdk';
import { ResourceRow } from '@gcore/wizard-step-kit/react';
import { Field } from '../components.jsx';

// The full request-time gate, including the challenge round trip. Duplicated
// per variant (rather than shared) so each panel can highlight its own
// difference directly on the diagram — the "valid" arrow and the Origin box
// are the only two things that actually change between A and B; everything
// above them is identical (the Rust filter has no concept of "variant" at
// all, see otp-filter/src/lib.rs: it checks mfa_session on every request
// either way). Vertical, not horizontal: the gap between stacked boxes gives
// label text the full canvas width instead of the few px between side-by-side
// boxes. Colours live in styles.css (.totp-flow-*), never as attributes here,
// so the CSS token-lint gate covers them.
function VariantADiagram() {
    return (
        <svg className="totp-flow" viewBox="0 0 460 480" role="img"
            aria-label="Browser requests a protected path. The CDN edge filter checks for an mfa_session cookie; if missing, it redirects to the challenge page. The user enters a code there, which sets mfa_session and retries the original request. The edge filter checks again — if valid, the request reaches your origin; if still invalid or missing, the edge blocks it with a 401 and your origin never sees it.">
            <defs>
                <marker id="totp-gate-a-neutral" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" className="totp-flow-marker" />
                </marker>
                <marker id="totp-gate-a-ok" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" className="totp-flow-marker--ok" />
                </marker>
                <marker id="totp-gate-a-blocked" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" className="totp-flow-marker--blocked" />
                </marker>
            </defs>
            <rect x="20" y="10" width="160" height="50" rx="6" className="totp-flow-box" />
            <text x="100" y="40" textAnchor="middle" className="totp-flow-text">Browser</text>
            <line x1="100" y1="60" x2="100" y2="104" className="totp-flow-arrow" markerEnd="url(#totp-gate-a-neutral)" />
            <text x="118" y="86" className="totp-flow-text--muted">request to protected path</text>
            <rect x="20" y="104" width="160" height="60" rx="6" className="totp-flow-box" />
            <text x="100" y="128" textAnchor="middle" className="totp-flow-text">CDN Edge</text>
            <text x="100" y="146" textAnchor="middle" className="totp-flow-text--muted">checks mfa_session</text>
            <line x1="100" y1="164" x2="100" y2="208" className="totp-flow-arrow" markerEnd="url(#totp-gate-a-neutral)" />
            <text x="118" y="190" className="totp-flow-text--muted">no session → redirect</text>
            <rect x="20" y="208" width="160" height="60" rx="6" className="totp-flow-box" />
            <text x="100" y="232" textAnchor="middle" className="totp-flow-text">Challenge</text>
            <text x="100" y="250" textAnchor="middle" className="totp-flow-text--muted">(otp-app — enter code)</text>
            <line x1="100" y1="268" x2="100" y2="312" className="totp-flow-arrow" markerEnd="url(#totp-gate-a-neutral)" />
            <text x="118" y="286" className="totp-flow-text--muted">code verified →</text>
            <text x="118" y="302" className="totp-flow-text--muted">mfa_session set, retry</text>
            <rect x="20" y="312" width="160" height="60" rx="6" className="totp-flow-box" />
            <text x="100" y="336" textAnchor="middle" className="totp-flow-text">CDN Edge</text>
            <text x="100" y="354" textAnchor="middle" className="totp-flow-text--muted">checks again</text>
            <line x1="100" y1="372" x2="100" y2="416" className="totp-flow-arrow totp-flow-arrow--ok" markerEnd="url(#totp-gate-a-ok)" />
            <text x="118" y="398" className="totp-flow-text--muted">valid</text>
            <rect x="20" y="416" width="160" height="50" rx="6" className="totp-flow-box" />
            <text x="100" y="446" textAnchor="middle" className="totp-flow-text">Your Origin</text>
            <line x1="180" y1="342" x2="270" y2="342" className="totp-flow-arrow totp-flow-arrow--blocked" markerEnd="url(#totp-gate-a-blocked)" />
            <text x="280" y="338" className="totp-flow-text--muted">invalid / missing</text>
            <text x="280" y="354" className="totp-flow-text--blocked">401 — origin never sees it</text>
        </svg>
    );
}

// Same gate as Variant A, down to the same 401 branch — only the "valid"
// arrow and the Origin box differ, called out directly on the diagram.
function VariantBDiagram() {
    return (
        <svg className="totp-flow" viewBox="0 0 460 530" role="img"
            aria-label="Same gate as Variant A up through the challenge and retry. This time the retry also carries a one-time mfa_proof. If the edge filter finds a valid mfa_session, the request reaches your origin with that proof attached; your origin verifies it via JWKS and mints its own session with whatever lifetime it chooses. If the session is still invalid or missing, the edge blocks it with a 401, same as Variant A.">
            <defs>
                <marker id="totp-gate-b-neutral" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" className="totp-flow-marker" />
                </marker>
                <marker id="totp-gate-b-ok" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" className="totp-flow-marker--ok" />
                </marker>
                <marker id="totp-gate-b-blocked" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" className="totp-flow-marker--blocked" />
                </marker>
            </defs>
            <rect x="20" y="10" width="160" height="50" rx="6" className="totp-flow-box" />
            <text x="100" y="40" textAnchor="middle" className="totp-flow-text">Browser</text>
            <line x1="100" y1="60" x2="100" y2="104" className="totp-flow-arrow" markerEnd="url(#totp-gate-b-neutral)" />
            <text x="118" y="86" className="totp-flow-text--muted">request to protected path</text>
            <rect x="20" y="104" width="160" height="60" rx="6" className="totp-flow-box" />
            <text x="100" y="128" textAnchor="middle" className="totp-flow-text">CDN Edge</text>
            <text x="100" y="146" textAnchor="middle" className="totp-flow-text--muted">checks mfa_session</text>
            <line x1="100" y1="164" x2="100" y2="208" className="totp-flow-arrow" markerEnd="url(#totp-gate-b-neutral)" />
            <text x="118" y="190" className="totp-flow-text--muted">no session → redirect</text>
            <rect x="20" y="208" width="160" height="60" rx="6" className="totp-flow-box" />
            <text x="100" y="232" textAnchor="middle" className="totp-flow-text">Challenge</text>
            <text x="100" y="250" textAnchor="middle" className="totp-flow-text--muted">(otp-app — enter code)</text>
            <line x1="100" y1="268" x2="100" y2="312" className="totp-flow-arrow" markerEnd="url(#totp-gate-b-neutral)" />
            <text x="118" y="286" className="totp-flow-text--muted">code verified →</text>
            <text x="118" y="302" className="totp-flow-text--muted">session + proof set, retry</text>
            <rect x="20" y="312" width="160" height="60" rx="6" className="totp-flow-box" />
            <text x="100" y="336" textAnchor="middle" className="totp-flow-text">CDN Edge</text>
            <text x="100" y="354" textAnchor="middle" className="totp-flow-text--muted">checks again</text>
            <line x1="100" y1="372" x2="100" y2="416" className="totp-flow-arrow totp-flow-arrow--ok" markerEnd="url(#totp-gate-b-ok)" />
            <text x="118" y="398" className="totp-flow-text--muted">valid — with token</text>
            <rect x="10" y="416" width="180" height="100" rx="6" className="totp-flow-box" />
            <text x="100" y="440" textAnchor="middle" className="totp-flow-text">Your Origin</text>
            <text x="100" y="458" textAnchor="middle" className="totp-flow-text--muted">verifies proof via JWKS</text>
            <text x="100" y="474" textAnchor="middle" className="totp-flow-text--muted">mints own session</text>
            <text x="100" y="490" textAnchor="middle" className="totp-flow-text--muted">(any TTL)</text>
            <line x1="180" y1="342" x2="270" y2="342" className="totp-flow-arrow totp-flow-arrow--blocked" markerEnd="url(#totp-gate-b-blocked)" />
            <text x="280" y="338" className="totp-flow-text--muted">invalid / missing</text>
            <text x="280" y="354" className="totp-flow-text--blocked">401 — same as Variant A</text>
        </svg>
    );
}

export function StepVariant({ session, f, set }) {
    const [busy, setBusy] = useState(false);
    async function genKeypair() {
        setBusy(true);
        try {
            const r = await optional(() => session.fastedge.secrets.generateKeypair({
                name: `${f.name}-proof-key`, comment: 'ES256 proof signing key (Variant B)', algorithm: 'ES256',
            }));
            if (r) set({ proofKey: r });
        } catch (err) {
            console.error('proof keypair generation failed:', err);
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <h2 tabIndex={-1}>Enforcement variant</h2>
            <p className="totp-lede">This controls <strong>who checks that MFA passed</strong> — the
                CDN edge, or your origin server. Both variants run the same challenge/verify loop
                shown below; this only changes what happens after a user enters a correct code —
                highlighted on each diagram.</p>
            <OptionalPanels onChange={(sel) => set({ variant: sel[0] || '' })}>
                <WizardPanel value="A" label="Variant A — edge enforces (recommended)">
                    <VariantADiagram />
                    <p>The CDN blocks any request to a protected path unless it carries a valid
                        MFA session cookie — your origin never sees a request that hasn&apos;t
                        passed MFA, and doesn&apos;t need to check anything itself. This is the
                        simplest option: <strong>no origin code changes</strong> beyond the
                        password→challenge handoff. The session is fixed at up to 8 hours and
                        can&apos;t be revoked early from your side.</p>
                    <p><strong>Requires:</strong> your origin must only be reachable through this
                        CDN resource (no direct IP/hostname access) — otherwise a request can skip
                        the edge check entirely and reach your origin unverified.</p>
                </WizardPanel>
                <WizardPanel value="B" label="Variant B — origin verifies a signed proof">
                    <VariantBDiagram />
                    <p>The CDN edge gate is <strong>unchanged from Variant A</strong> — same
                        <code> mfa_session</code> check, same 401 on a protected path. On top of
                        that, the app hands your origin a signed, one-time token (like a JWT)
                        proving MFA passed for a specific user. Your origin checks that signature
                        itself — using a public key this app publishes, so nothing secret needs to
                        be shared — and then creates <strong>its own session</strong>, on whatever
                        timeline it wants (revocable, longer-lived, etc). This needs a small amount
                        of origin code to verify the token.</p>
                    <p>Choose this if you want to be able to revoke a session yourself, need an
                        origin-managed session lifetime, or can&apos;t fully lock your origin down
                        to CDN-only traffic — because the origin verifies independently here, it
                        doesn&apos;t rely on trusting that every request came through the edge.</p>
                    <ResourceRow title="ES256 proof keypair"
                        sub="Private key stored as a secret on the app; public JWK served at {AUTH_PREFIX}/.well-known/jwks.json."
                        set={!!f.proofKey} value={f.proofKey?.name} onClear={() => set({ proofKey: null })}>
                        <button onClick={genKeypair} disabled={busy}>Generate keypair</button>
                    </ResourceRow>
                    <Field label="Proof TTL (seconds)" value={f.proofTtl}
                        onChange={(v) => set({ proofTtl: v })}
                        hint="How long the one-time proof cookie is valid. Short is intentional — it's single-use. Default: 90" />
                    <Field label="Proof cookie name" value={f.proofCookie}
                        onChange={(v) => set({ proofCookie: v })}
                        hint="Name of the one-time ES256 proof cookie. Default: mfa_proof" />
                </WizardPanel>
            </OptionalPanels>
        </>
    );
}
