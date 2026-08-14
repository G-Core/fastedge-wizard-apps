import { DeployProgress } from '@gcore/wizard-step-kit/react';

const VARIANT_LABEL = {
    'gate-only': 'Gate-only — allow/deny only',
    cookie: 'Cookie — verifiable ES256 JWT',
    header: 'Header — x-sso-* identity headers',
};

const PROVIDER_LABEL = { google: 'Google', github: 'GitHub', microsoft: 'Microsoft', facebook: 'Facebook', saml: 'SAML' };

export function StepReview({ f, deploy, authT, filterT }) {
    const d = deploy.state;
    return (
        <>
            <h2 tabIndex={-1}>Review &amp; deploy</h2>
            <dl className="sso-summary">
                <dt>Variant</dt><dd>{VARIANT_LABEL[f.variant]}</dd>
                <dt>CDN resource</dt><dd>{f.cdn?.cname} (#{f.cdn?.id})</dd>
                <dt>Apps</dt><dd>{f.name}-app ({authT?.name}) + {f.name}-filter ({filterT?.name})</dd>
                <dt>Auth prefix</dt><dd>{f.authPrefix}</dd>
                <dt>Protection scope</dt>
                <dd>{f.protectionScope === 'all' ? 'Entire site' : f.protectedPaths}</dd>
                <dt>SSO audience</dt><dd>{f.audience}</dd>
                <dt>Session cookie</dt><dd>{f.cookie}{f.issuer ? ` · issuer ${f.issuer}` : ''}</dd>
                <dt>Signing</dt>
                <dd>{f.variant === 'cookie' ? 'ES256 keypair + flow-cookie secret' : 'HS256 shared secret'}</dd>
                <dt>Providers</dt>
                <dd>{f.selectedProviders.length ? f.selectedProviders.map((p) => PROVIDER_LABEL[p]).join(', ') : '(none selected)'}</dd>
                {f.canonicalHost && <><dt>Canonical host</dt><dd>{f.canonicalHost}</dd></>}
                {f.allowedOrigins && <><dt>Allowed redirect origins</dt><dd>{f.allowedOrigins}</dd></>}
                {f.loginUrl && <><dt>Custom login page</dt><dd>{f.loginUrl}</dd></>}
                {f.brandMode === 'custom' && <>
                    <dt>Branding</dt><dd>{f.brandTitle || '(default title)'}{f.brandLogo ? ' · logo set' : ''}</dd>
                </>}
            </dl>
            <p className="sso-lede">Click <strong>Deploy</strong> to plan and apply. You will be
                asked to confirm the plan in a portal dialog.</p>

            <DeployProgress state={d} />

            {d.result?.status === 'complete' && f.variant === 'cookie' &&
                <p className="sso-lede">SSO is now set up — the edge already verifies the session on every
                    request before your origin sees it. If you&apos;d like to read the user&apos;s identity yourself,
                    you can optionally verify the <code>{f.cookie}</code> cookie&apos;s JWT (ES256) against the JWKS
                    at <code>{f.authPrefix}/.well-known/jwks.json</code> — check <code>aud</code> equals{' '}
                    <code>{f.audience}</code>{f.issuer && <> and <code>iss</code> equals <code>{f.issuer}</code></>}.</p>}

            {d.result?.status === 'complete' && f.variant === 'header' &&
                <p className="sso-lede">SSO is now set up. Your origin receives the authenticated user&apos;s
                    identity via the <code>x-sso-user</code> header{f.claims.length
                        ? <> (plus {f.claims.map((c, i) => (
                            <span key={c}>{i > 0 && (i === f.claims.length - 1 ? ' and ' : ', ')}
                                <code>x-sso-{c.replace(/_/g, '-')}</code></span>
                        ))} for the claims you selected)</>
                        : <> — no other claims were selected, so <code>x-sso-user</code> is the only identity
                            header your origin will see</>}. These headers aren&apos;t signed — your origin trusts
                    them only because the edge filter guarantees they&apos;re never set on an unauthenticated
                    request. Lock your origin down to accept traffic only from this CDN resource, otherwise
                    someone could send spoofed <code>x-sso-*</code> headers directly to it.</p>}
        </>
    );
}
