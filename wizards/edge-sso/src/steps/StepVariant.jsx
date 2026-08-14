import { OptionalPanels, WizardPanel } from '@gcore/wizard-step-kit/react';

// The request-time gate loop, shared by all three variants — verified against
// cdn-filter/src/lib.rs: the filter's deny() always 302-redirects to the auth
// app (falling back to its own root if no LOGIN_PAGE_URL is set), never a
// bare 401 — so unlike edge-totp's filter there's no dead-end branch to draw,
// just a loop back to the auth app. What actually differs per variant is the
// second edge-check's behavior (strip cookie / keep cookie / inject headers)
// and what Origin ends up receiving, called out via edgeNote/validLabel/
// originNotes. One parameterized component, not three near-duplicate ~45-line
// blocks, since the shape is identical and only these strings change.
// Vertical, not horizontal: the gap between stacked boxes gives label text
// the full canvas width. Colours live in styles.css (.sso-flow-*), never as
// attributes here, so the CSS token-lint gate covers them.
function GateDiagram({ idPrefix, ariaLabel, edgeNote, validLabel, originNotes }) {
    return (
        <svg className="sso-flow" viewBox="0 0 460 500" role="img" aria-label={ariaLabel}>
            <defs>
                <marker id={`${idPrefix}-neutral`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" className="sso-flow-marker" />
                </marker>
                <marker id={`${idPrefix}-ok`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" className="sso-flow-marker--ok" />
                </marker>
            </defs>
            <rect x="20" y="10" width="160" height="50" rx="6" className="sso-flow-box" />
            <text x="100" y="40" textAnchor="middle" className="sso-flow-text">Browser</text>
            <line x1="100" y1="60" x2="100" y2="104" className="sso-flow-arrow" markerEnd={`url(#${idPrefix}-neutral)`} />
            <text x="118" y="86" className="sso-flow-text--muted">request to protected path</text>
            <rect x="20" y="104" width="160" height="60" rx="6" className="sso-flow-box" />
            <text x="100" y="128" textAnchor="middle" className="sso-flow-text">CDN Edge</text>
            <text x="100" y="146" textAnchor="middle" className="sso-flow-text--muted">checks session cookie</text>
            <line x1="100" y1="164" x2="100" y2="208" className="sso-flow-arrow" markerEnd={`url(#${idPrefix}-neutral)`} />
            <text x="118" y="182" className="sso-flow-text--muted">no/invalid session →</text>
            <text x="118" y="198" className="sso-flow-text--muted">redirect</text>
            <rect x="20" y="208" width="160" height="60" rx="6" className="sso-flow-box" />
            <text x="100" y="232" textAnchor="middle" className="sso-flow-text">Auth app</text>
            <text x="100" y="250" textAnchor="middle" className="sso-flow-text--muted">(federates to IdP)</text>
            <line x1="100" y1="268" x2="100" y2="312" className="sso-flow-arrow" markerEnd={`url(#${idPrefix}-neutral)`} />
            <text x="118" y="286" className="sso-flow-text--muted">session set →</text>
            <text x="118" y="302" className="sso-flow-text--muted">retry</text>
            <rect x="20" y="312" width="160" height="60" rx="6" className="sso-flow-box" />
            <text x="100" y="336" textAnchor="middle" className="sso-flow-text">CDN Edge</text>
            <text x="100" y="354" textAnchor="middle" className="sso-flow-text--muted">{edgeNote}</text>
            <line x1="100" y1="372" x2="100" y2="416" className="sso-flow-arrow sso-flow-arrow--ok" markerEnd={`url(#${idPrefix}-ok)`} />
            <text x="118" y="398" className="sso-flow-text--muted">{validLabel}</text>
            <rect x="10" y="416" width="180" height="70" rx="6" className="sso-flow-box" />
            <text x="100" y="440" textAnchor="middle" className="sso-flow-text">Your Origin</text>
            <text x="100" y="458" textAnchor="middle" className="sso-flow-text--muted">{originNotes[0]}</text>
            <text x="100" y="474" textAnchor="middle" className="sso-flow-text--muted">{originNotes[1]}</text>
        </svg>
    );
}

export function StepVariant({ f, set }) {
    return (
        <>
            <h2 tabIndex={-1}>Choose identity delivery</h2>
            <p className="sso-lede">
                All three variants run the same login loop shown below — the CDN edge gates every
                request the same way. Provider choice (Google/GitHub/SAML/etc.) is a later step,
                independent of this one. What differs is called out on each diagram: how the edge
                forwards the request the second time, and what your origin ends up receiving.
            </p>
            <OptionalPanels onChange={(sel) => set({ variant: sel[0] || '' })}>
                <WizardPanel value="gate-only" label="Gate-only — allow/deny">
                    <GateDiagram idPrefix="sso-gate-a" edgeNote="checks again, strips cookie"
                        validLabel="valid" originNotes={['receives no identity —', 'pass/deny only']}
                        ariaLabel="Browser requests a protected path. The CDN edge filter checks the session cookie; if missing or invalid, it redirects to the auth app, which federates to the identity provider and sets a session cookie, then retries. The edge filter checks again, strips the session cookie, and forwards the request — your origin receives no identity, only a pass or deny decision." />
                    <p>The edge delivers <strong>nothing</strong> to your origin — just pass or
                        redirect. Simplest option. Use when your origin only needs to know
                        &quot;is this user authed?&quot; (static sites, downloads, internal tools).</p>
                </WizardPanel>
                <WizardPanel value="cookie" label="Cookie — verifiable JWT">
                    <GateDiagram idPrefix="sso-gate-b" edgeNote="checks again, leaves cookie"
                        validLabel="valid — cookie kept" originNotes={['reads + verifies the JWT', 'cookie itself, via JWKS']}
                        ariaLabel="Same gate as gate-only. This time the edge filter checks again and leaves the session cookie in place, forwarding the request with the cookie attached; your origin reads and verifies that JWT cookie itself via the published JWKS endpoint." />
                    <p>The edge sets a signed <strong>ES256 JWT cookie</strong> your origin can
                        verify itself via a published JWKS endpoint — no shared secret needed on
                        your side. Use when your origin already verifies stateless JWTs.</p>
                </WizardPanel>
                <WizardPanel value="header" label="Header — x-sso-* identity headers">
                    <GateDiagram idPrefix="sso-gate-c" edgeNote="checks again, injects x-sso-*"
                        validLabel="valid — headers injected" originNotes={['trusts x-sso-user and', 'x-sso-* headers from the edge']}
                        ariaLabel="Same gate as gate-only. This time the edge filter checks again, strips the session cookie, and injects x-sso-user plus per-claim x-sso-* request headers; your origin trusts those headers because the edge guarantees they're only set on an authenticated request." />
                    <p>The edge injects <code>x-sso-user</code> and per-claim{' '}
                        <code>x-sso-*</code> request headers upstream; your origin trusts the
                        edge. Use when your origin has server-side sessions, or won&apos;t verify
                        tokens itself.</p>
                    <p><strong>Requires:</strong> your origin must only be reachable through this
                        CDN resource (no direct IP/hostname access) — these headers aren&apos;t
                        signed, so anyone who can reach your origin directly can send spoofed
                        <code> x-sso-*</code> headers and impersonate any user.</p>
                </WizardPanel>
            </OptionalPanels>
        </>
    );
}
