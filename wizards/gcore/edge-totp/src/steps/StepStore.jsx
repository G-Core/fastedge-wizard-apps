import { useState } from 'react';
import { optional } from '@gcoredev/fastedge-wizard-sdk';
import { ResourceRow } from '@gcore/wizard-step-kit/react';
import { Note } from '../components.jsx';

export function StepStore({ session, f, set }) {
    const [busy, setBusy] = useState(false);
    // One call: the user selects an existing store or creates one inline in the same host modal.
    async function selectStore() {
        setBusy(true);
        try {
            const rs = await optional(() => session.fastedge.stores.pickOrCreate());
            if (rs && rs.length) set({ store: rs[0] });
        } catch (err) {
            console.error('Edge Storage select failed:', err);
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <h2 tabIndex={-1}>Edge Storage for TOTP seeds</h2>
            <p className="totp-lede">
                A &quot;seed&quot; is the secret each user&apos;s authenticator app (Google
                Authenticator, Authy, etc) is set up with — it&apos;s what generates their 6-digit
                codes, and it&apos;s per-user. Seeds live in Gcore Edge Storage: written once at
                enrollment, read every time that user completes a challenge.
            </p>
            <Note kind="warn">
                Use a <strong>dedicated</strong> Edge Storage instance. Seeds are stored masked —
                reading them back through the Gcore API (including with the token you add next)
                only ever returns the masked value, never the real seed; only this app&apos;s own
                code can read a seed in the clear. That token still has <strong>write</strong>
                access to everything in the store, though, so anyone holding it could overwrite a
                user&apos;s seed and hijack their second factor — keep it scoped to this store
                alone.
            </Note>
            <ResourceRow title="Edge Storage"
                sub="Create a new instance or pick an existing one."
                value={f.store ? `${f.store.name} (#${f.store.id})` : undefined}
                set={!!f.store} onClear={() => set({ store: null })}>
                <button onClick={selectStore} disabled={busy}>Select</button>
            </ResourceRow>
        </>
    );
}
