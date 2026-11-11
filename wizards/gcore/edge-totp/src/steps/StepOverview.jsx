import { Note, Field } from '../components.jsx';

export function StepOverview({ f, set, filterT, appT, reentry = false, loadErrors = {} }) {
    const problems = Object.entries(loadErrors);
    return (
        <>
            <h2 tabIndex={-1}>{reentry ? 'Edit Edge TOTP MFA' : 'Deploy Edge TOTP MFA'}</h2>
            {reentry && (
                <Note kind="info">
                    You are editing a deployed setup. Changes apply to the existing apps and CDN rules
                    when you deploy. The deployment name, CDN resource, variant, auth prefix, seed store
                    and session signing key are fixed after the first deploy.
                </Note>
            )}
            {problems.length > 0 && (
                <Note kind="danger">
                    <strong>Some settings could not be read from the deployment</strong> (they were
                    changed outside this wizard). They show their defaults below; deploying keeps the
                    deployed value unless you change the field:
                    <ul>
                        {problems.map(([key, err]) => (
                            <li key={key}><code>{key}</code>: {err.message}</li>
                        ))}
                    </ul>
                </Note>
            )}
            <p className="totp-lede">
                This adds a TOTP (authenticator-app) second factor in front of your existing
                login, enforced at the CDN edge. It deploys <strong>two</strong> FastEdge apps
                onto a single CDN resource and wires the routing for you.
            </p>
            <Note kind="info">
                <strong>What gets created:</strong>
                <ul>
                    <li><strong>{filterT?.name}</strong> ({filterT?.api_type}) — the enforcement
                        filter: verifies the <code>mfa_session</code> cookie on every protected
                        request.</li>
                    <li><strong>{appT?.name}</strong> ({appT?.api_type}) — the challenge/verify
                        app: hosts the OTP page and issues the session cookie.</li>
                    <li>A CDN origin + path rule for the login flow, and the filter attached in
                        front of your protected paths.</li>
                </ul>
            </Note>
            <Note kind="warn">
                Both apps must share one CDN host so the <code>mfa_session</code> cookie —
                the proof a visitor already passed MFA — is first-party. The filter
                <strong> fail-closes</strong>: get the shared audience value wrong or leave it
                blank, and every visitor is blocked, not let through. This wizard keeps the
                shared values in sync for you.
            </Note>
            <Field label="Deployment name" value={f.name} onChange={(v) => set({ name: v })}
                hint="Used to name the two apps, the origin, and the CDN rules (e.g. totp-app, totp-filter)."
                disabled={reentry} />
        </>
    );
}
