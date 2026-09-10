import { OptionalPanels, WizardPanel } from '@gcore/wizard-step-kit/react';
import { Field } from '../components.jsx';

export function StepTotpSettings({ f, set }) {
    return (
        <>
            <h2 tabIndex={-1}>TOTP &amp; session settings</h2>
            <p className="totp-lede">
                Both sections use Gcore defaults when left unselected. Open a section only
                to override.
            </p>

            <h3>TOTP authenticator</h3>
            <OptionalPanels onChange={(sel) => set({ totpMode: sel[0] || 'default' })}>
                <WizardPanel value="custom" label="Customize TOTP settings">
                    <Field label="Issuer name" value={f.totpIssuer}
                        onChange={(v) => set({ totpIssuer: v })}
                        hint="Shown in the user's authenticator app next to the account. Default: TOTP" />
                    <Field label="OTP digits" value={f.totpDigits}
                        onChange={(v) => set({ totpDigits: v })}
                        hint="Number of digits in the OTP code. Default: 6. Most authenticators support 6 only." />
                    <Field label="Period (seconds)" value={f.totpPeriod}
                        onChange={(v) => set({ totpPeriod: v })}
                        hint="Time step in seconds. Must match the authenticator. Default: 30" />
                    <Field label="Algorithm" value={f.totpAlgo}
                        onChange={(v) => set({ totpAlgo: v })}
                        hint="HMAC algorithm. Default: SHA1. RFC 6238 mandates SHA1; most authenticators only support SHA1." />
                    <Field label="Drift (±steps)" value={f.totpDrift}
                        onChange={(v) => set({ totpDrift: v })}
                        hint="Clock-drift tolerance in steps. Default: 1. Increase only for deployments with known clock skew." />
                </WizardPanel>
            </OptionalPanels>

            <h3>Session &amp; policy</h3>
            <OptionalPanels onChange={(sel) => set({ policyMode: sel[0] || 'default' })}>
                <WizardPanel value="custom" label="Customize session &amp; policy">
                    <Field label="Session TTL (seconds)" value={f.sessionTtl}
                        onChange={(v) => set({ sessionTtl: v })}
                        hint="mfa_session cookie lifetime. Default: 28800 (8 hours)." />
                    <Field label="Max verify attempts" value={f.maxAttempts}
                        onChange={(v) => set({ maxAttempts: v })}
                        hint="Failed /verify attempts per 5-minute window before lockout. Default: 5. PoP-local — defense-in-depth only." />
                    <Field label="Ticket TTL (seconds)" value={f.ticketTtl}
                        onChange={(v) => set({ ticketTtl: v })}
                        hint="Handoff ticket lifetime. Short TTL is intentional — the user is mid-login. Default: 90" />
                    <Field label="Storage key prefix" value={f.kvPrefix}
                        onChange={(v) => set({ kvPrefix: v })}
                        hint="Prefix prepended to userId for Edge Storage keys. Override only to share one instance across multiple apps. Default: totp:" />
                    <label className="totp-field">
                        <span>Allow self-enrollment</span>
                        <select value={f.selfEnroll} onChange={(e) => set({ selfEnroll: e.target.value })}>
                            <option value="true">true — user may self-enroll on first login (default)</option>
                            <option value="false">false — admin-provisioned deployments only</option>
                        </select>
                        <span className="totp-hint">Whether an unenrolled user may self-enroll via /auth/totp/activate.</span>
                    </label>
                </WizardPanel>
            </OptionalPanels>
        </>
    );
}
