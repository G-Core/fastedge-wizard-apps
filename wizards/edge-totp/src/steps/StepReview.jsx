import { DeployProgress } from '@gcore/wizard-step-kit/react';
import { Note } from '../components.jsx';

export function StepReview({ f, deploy, filterT, appT }) {
    const d = deploy.state;
    return (
        <>
            <h2 tabIndex={-1}>Review &amp; deploy</h2>
            {!f.loginUrl && (
                <Note kind="danger">
                    <strong>No Login URL configured.</strong> Every protected path will return a bare
                    <code> 401 &quot;MFA required&quot;</code> to unauthenticated visitors instead of
                    sending them to a challenge screen. Go back to Routing &amp; token binding and set
                    one unless every protected path is a non-browser API.
                </Note>
            )}
            <dl className="totp-summary">
                <dt>CDN resource</dt><dd>{f.cdn?.cname} (#{f.cdn?.id})</dd>
                <dt>Apps</dt><dd>{f.name}-filter ({filterT?.name}) + {f.name}-app ({appT?.name})</dd>
                <dt>Auth prefix</dt><dd>{f.authPrefix}</dd>
                <dt>Protection scope</dt>
                <dd>{f.protectionScope === 'all' ? 'Entire site' : f.protectedPaths}</dd>
                <dt>Login URL</dt><dd>{f.loginUrl || '(none — denied requests get a 401)'}</dd>
                <dt>MFA audience</dt><dd>{f.audience}</dd>
                <dt>Session cookie</dt><dd>{f.cookie}{f.issuer ? ` · issuer ${f.issuer}` : ''}</dd>
                <dt>Edge Storage</dt><dd>{f.store?.name} (#{f.store?.id})</dd>
                <dt>Secrets</dt><dd>session key, handoff key, enroll key, Gcore API token{f.variant === 'B' ? ', ES256 proof key' : ''}</dd>
                <dt>Variant</dt><dd>{f.variant === 'B' ? 'B — origin verifies ES256 proof' : 'A — edge enforces'}</dd>
                {f.variant === 'B' && f.proofTtl !== '90' && <><dt>Proof TTL</dt><dd>{f.proofTtl}s</dd></>}
                {f.variant === 'B' && f.proofCookie !== 'mfa_proof' && <><dt>Proof cookie</dt><dd>{f.proofCookie}</dd></>}
                {f.totpMode === 'custom' && <>
                    <dt>TOTP issuer</dt><dd>{f.totpIssuer}</dd>
                    <dt>TOTP config</dt><dd>{f.totpDigits} digits · {f.totpPeriod}s · {f.totpAlgo} · ±{f.totpDrift} steps</dd>
                </>}
                {f.policyMode === 'custom' && <>
                    <dt>Session TTL</dt><dd>{f.sessionTtl}s</dd>
                    <dt>Max attempts</dt><dd>{f.maxAttempts}</dd>
                    <dt>Ticket TTL</dt><dd>{f.ticketTtl}s</dd>
                    <dt>Storage key prefix</dt><dd>{f.kvPrefix}</dd>
                    <dt>Self-enrollment</dt><dd>{f.selfEnroll}</dd>
                </>}
                {f.brandMode === 'custom' && <>
                    <dt>Branding</dt><dd>{f.brandName || '(no name)'}{f.brandLogo ? ' · logo set' : ''}{f.brandFavicon ? ' · favicon set' : ''}</dd>
                    {f.brandColor !== '#0066cc' && <><dt>Button color</dt><dd>{f.brandColor}</dd></>}
                </>}
            </dl>
            <p className="totp-lede">Click <strong>Deploy</strong> to plan and apply. You will be
                asked to confirm the plan in a portal dialog.</p>

            <DeployProgress state={d} />

            {d.result?.status === 'complete' && f.variant === 'B' &&
                <div className="totp-lede">
                    <p>MFA is now set up. To integrate your origin with the challenge/verify flow:</p>
                    <ul>
                        <li>Send users who need verification to the challenge endpoint at<br />
                            <code>{f.authPrefix}/challenge</code>.</li>
                        <li>After a successful challenge, read the proof JWT from the <code>{f.proofCookie}</code> cookie and verify its ES256 signature against the JWKS already served at <code>{f.authPrefix}/.well-known/jwks.json</code> — you don&apos;t need to publish anything yourself.</li>
                        <li>Check the JWT&apos;s <code>aud</code> claim equals <code>{f.audience}</code>{f.issuer && <> and <code>iss</code> equals <code>{f.issuer}</code></>}, and that <code>sub</code> matches the user you sent to the challenge.</li>
                        <li>Lock your origin down to accept traffic only from this CDN resource — otherwise requests can bypass the edge filter and hit your origin directly.</li>
                    </ul>
                </div>}
        </>
    );
}
