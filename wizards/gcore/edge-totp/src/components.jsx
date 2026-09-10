// Wizard-local presentational helpers. `optional()` now lives in the SDK
// (`@gcoredev/fastedge-wizard-sdk`) and the resource row in the step-kit
// (`@gcore/wizard-step-kit/react` → ResourceRow).

export function Note({ kind = 'info', children }) {
    return <div className={`totp-note totp-note--${kind}`}>{children}</div>;
}

export function Field({ label, hint, value, onChange, placeholder }) {
    return (
        <label className="totp-field">
            <span>{label}</span>
            <input type="text" value={value} placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)} />
            {hint && <span className="totp-hint">{hint}</span>}
        </label>
    );
}
