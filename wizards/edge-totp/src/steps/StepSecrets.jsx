import { useState } from 'react';
import { optional } from '@gcoredev/fastedge-wizard-sdk';
import { ResourceRow } from '@gcore/wizard-step-kit/react';

export function StepSecrets({ session, f, set }) {
    const generatedElsewhere = f.variant === 'B'
        ? ` Variant B also uses a fifth — the ES256 proof key — which you already generated back in the Variant step; it is not listed here.`
        : '';
    const [busy, setBusy] = useState('');
    // Wizard-defined HS256 keys → pickOrCreate({ bytes }): the host picker lets the user generate a
    // fresh 32-byte value OR reuse a secret a prior run created (rename-safe — picked from the live
    // list), so a re-run after a failed deploy no longer collides on the deterministic name.
    const generate = (key, label, name, comment) => async () => {
        setBusy(key);
        try {
            const rs = await optional(() => session.fastedge.secrets.pickOrCreate({ name, comment, bytes: 32, label }));
            if (rs && rs.length) set({ [key]: rs[0] });
        } catch (err) {
            console.error(`secret pick/generate (${key}) failed:`, err);
        } finally {
            setBusy('');
        }
    };
    // Gcore API token is a real external token the user brings → pickOrCreate: they select an
    // existing secret or create one inline (pasting the token) in the same host modal.
    async function selectToken() {
        setBusy('gcore');
        try {
            const rs = await optional(() => session.fastedge.secrets.pickOrCreate({ label: 'Gcore API token' }));
            if (rs && rs.length) set({ gcore: rs[0] });
        } catch (err) {
            console.error('Gcore API token select failed:', err);
        } finally {
            setBusy('');
        }
    }
    return (
        <>
            <h2 tabIndex={-1}>Secrets</h2>
            <p className="totp-lede">
                Four secrets, four different jobs: one proves the CDN filter to itself
                (<strong>session signing key</strong>), one proves your origin&apos;s password
                check to this app (<strong>handoff key</strong>), one gates who can enrol a user
                (<strong>enroll API key</strong>), and one lets this app read/write the seed store
                (<strong>Gcore API token</strong>). Generate each below — the session key is
                <strong> shared</strong>, created once and bound to both apps.{generatedElsewhere}
            </p>
            <ResourceRow title="Session signing key (shared)"
                sub="HS256, edge-internal. App signs mfa_session; filter verifies it." set={!!f.sessionKey}
                value={f.sessionKey?.name} onClear={() => set({ sessionKey: null })}>
                <button onClick={generate('sessionKey', 'Session signing key (shared)', `${f.name}-mfa-session-key`, 'Shared HS256 mfa_session key')}
                    disabled={!!busy}>Select</button>
            </ResourceRow>
            <ResourceRow title="Handoff key"
                sub="HS256, shared with your origin. Copy the generated value into your origin's login code." set={!!f.handoff}
                value={f.handoff?.name} onClear={() => set({ handoff: null })}>
                <button onClick={generate('handoff', 'Handoff key', `${f.name}-handoff-key`, 'HS256 handoff ticket key (shared with origin)')}
                    disabled={!!busy}>Select</button>
            </ResourceRow>
            <ResourceRow title="Enroll API key"
                sub="Bearer token gating POST {AUTH_PREFIX}/enroll." set={!!f.enroll}
                value={f.enroll?.name} onClear={() => set({ enroll: null })}>
                <button onClick={generate('enroll', 'Enroll API key', `${f.name}-enroll-api-key`, 'Bearer token for /enroll')}
                    disabled={!!busy}>Select</button>
            </ResourceRow>
            <ResourceRow title="Gcore API token"
                sub="Real token with Edge Storage write access — select an existing secret or create one." set={!!f.gcore}
                value={f.gcore?.name} onClear={() => set({ gcore: null })}>
                <button onClick={selectToken} disabled={busy === 'gcore'}>Select</button>
            </ResourceRow>
        </>
    );
}
