// Wizard-local presentational helpers. `optional()` lives in the SDK
// (`@gcoredev/fastedge-wizard-sdk`) and the resource row in the step-kit
// (`@gcore/wizard-step-kit/react` → ResourceRow).

export function Note({ kind = 'info', children }) {
    return <div className={`sso-note sso-note--${kind}`}>{children}</div>;
}

export function Field({ label, hint, value, onChange, placeholder, type = 'text' }) {
    return (
        <label className="sso-field">
            <span>{label}</span>
            <input type={type} value={value} placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)} />
            {hint && <span className="sso-hint">{hint}</span>}
        </label>
    );
}
