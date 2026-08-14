import { Note, Field } from '../components.jsx';

export function StepOverview({ f, set }) {
    return (
        <>
            <h2 tabIndex={-1}>Deploy Edge SSO</h2>
            <p className="sso-lede">
                Adds SSO (Google, GitHub, Microsoft, Facebook, SAML) in front of your existing
                site, enforced at the CDN edge — no backend changes. It deploys <strong>two</strong>{' '}
                FastEdge apps onto a single CDN resource and wires the routing for you.
            </p>
            <Note kind="info">
                <strong>What gets created:</strong>
                <ul>
                    <li>An <strong>auth app</strong> — federates to your chosen identity
                        provider(s) and issues a signed session token.</li>
                    <li>A <strong>CDN filter</strong> — verifies the session token on every
                        request and redirects unauthenticated users.</li>
                    <li>A CDN origin + path rule for the login flow, and the filter attached in
                        front of your protected paths.</li>
                </ul>
            </Note>
            <Note kind="warn">
                Both apps must share one CDN host so the session cookie is first-party. The
                filter <strong>fail-closes</strong>: get the shared audience value wrong or leave
                it blank, and it rejects every request — including the ones coming back from a
                successful login, so visitors see an endless redirect loop to the login page
                rather than a clean error. This wizard keeps the shared values in sync for you.
            </Note>
            <Field label="Deployment name" value={f.name} onChange={(v) => set({ name: v })}
                hint="Used to name the two apps, the origin, and the CDN rules (e.g. sso-app, sso-filter)." />
        </>
    );
}
