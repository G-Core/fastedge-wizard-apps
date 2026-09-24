import { useState } from 'react';
import { optional } from '@gcoredev/fastedge-wizard-sdk';
import { ResourceRow } from '@gcore/wizard-step-kit/react';

export function StepCdn({ session, f, set }) {
    const [busy, setBusy] = useState(false);
    async function pick() {
        setBusy(true);
        try {
            const r = await optional(() => session.cdn.resources.pick());
            if (r) {
                const derived = f.cdn ? `https://${f.cdn.cname}` : '';
                const origin = `https://${r.cname}`;
                const audience = (!f.audience || f.audience === derived) ? origin : f.audience;
                // Seed the protected site's own origin as an allowed ?redirect= target.
                // Without it every absolute redirect back to this very domain is dropped
                // and login always lands on "/". Self-origin is not an open redirect —
                // anything beyond it stays a deliberate choice in the Routing step.
                const allowedOrigins =
                    (!f.allowedOrigins || f.allowedOrigins === derived) ? origin : f.allowedOrigins;
                set({ cdn: r, audience, allowedOrigins });
            }
        } catch (err) {
            console.error('CDN resource pick failed:', err);
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <h2 tabIndex={-1}>Choose the CDN resource to protect</h2>
            <p className="sso-lede">
                Pick the CDN delivery domain that fronts the site you are protecting. Both apps
                are wired onto this one resource.
            </p>
            <ResourceRow title="CDN resource"
                sub="The filter and origin both attach here."
                value={f.cdn ? `${f.cdn.cname} (#${f.cdn.id})` : undefined}
                set={!!f.cdn}
                onClear={() => {
                    const derived = `https://${f.cdn.cname}`;
                    set({
                        cdn: null,
                        audience: f.audience === derived ? '' : f.audience,
                        allowedOrigins: f.allowedOrigins === derived ? '' : f.allowedOrigins,
                    });
                }}>
                <button onClick={pick} disabled={busy}>Select resource</button>
            </ResourceRow>
        </>
    );
}
