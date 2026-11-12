import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { connect, WizardError } from '@gcoredev/fastedge-wizard-sdk';
import '@gcore/wizard-step-kit'; // side-effect: registers the custom elements
import { WizardShell, WizardStep } from '@gcore/wizard-step-kit/react';

import { StepOverview } from './steps/StepOverview.jsx';
import { StepCdn } from './steps/StepCdn.jsx';
import { StepRouting } from './steps/StepRouting.jsx';
import { StepStore } from './steps/StepStore.jsx';
import { StepSecrets } from './steps/StepSecrets.jsx';
import { StepVariant } from './steps/StepVariant.jsx';
import { StepTotpSettings } from './steps/StepTotpSettings.jsx';
import { StepBranding } from './steps/StepBranding.jsx';
import { StepReview } from './steps/StepReview.jsx';
import {
    BRAND_DEFAULTS,
    POLICY_DEFAULTS,
    TOTP_DEFAULTS,
    deploymentName,
    fields,
    fromForm,
    loadForm,
    lockedFields,
    parseProtectedPaths,
    reentryValues,
    skeleton,
    toPlan,
} from './deployment.js';

const hostOrigin = new URLSearchParams(location.search).get('hostOrigin') || 'https://portal.gcore.com';

// ── Wizard root ────────────────────────────────────────────────────────────

const DEFAULT_FORM = {
    // Core
    name: 'totp',
    cdn: null,
    // Routing (shared between both apps)
    authPrefix: '/auth/totp',
    audience: '',
    cookie: 'mfa_session',
    issuer: '',
    loginUrl: '',
    // Protection scope — no default: forces an explicit choice instead of silently
    // protecting the entire CDN resource.
    protectionScope: '',
    protectedPaths: '',
    // KV store
    store: null,
    // Secrets
    sessionKey: null,
    handoff: null,
    enroll: null,
    gcore: null,
    // Variant A/B
    variant: 'A',
    proofKey: null,
    proofTtl: '90',
    proofCookie: 'mfa_proof',
    // TOTP authenticator settings
    totpMode: 'default',
    totpIssuer: TOTP_DEFAULTS.issuer,
    totpDigits: TOTP_DEFAULTS.digits,
    totpPeriod: TOTP_DEFAULTS.period,
    totpAlgo: TOTP_DEFAULTS.algo,
    totpDrift: TOTP_DEFAULTS.drift,
    // Session & policy
    policyMode: 'default',
    sessionTtl: POLICY_DEFAULTS.sessionTtl,
    maxAttempts: POLICY_DEFAULTS.maxAttempts,
    ticketTtl: POLICY_DEFAULTS.ticketTtl,
    kvPrefix: POLICY_DEFAULTS.kvPrefix,
    selfEnroll: POLICY_DEFAULTS.selfEnroll,
    // Branding
    brandMode: 'none',
    brandName: '',
    brandLogo: '',
    brandFavicon: '',
    brandColor: BRAND_DEFAULTS.color,
    brandHover: '',
};

const PARTIAL_APPLY = "Some changes couldn't be undone. Close the wizard and reopen it from the app to see what is deployed now.";

/** Re-entry: the form as loaded from the live deployment, plus what couldn't be read. */
function reentryForm(current) {
    const { form, errors } = loadForm(current);
    return {
        form: { ...DEFAULT_FORM, ...form, name: deploymentName(current), cdn: { id: current.cdnResourceId } },
        errors,
    };
}

function Wizard({ session, filterT, appT, current }) {
    const reentry = current !== null;
    const loaded = useMemo(() => (reentry ? reentryForm(current) : null), [current, reentry]);
    const locks = useMemo(() => lockedFields(current), [current]); // { field: reason } — Re-entry only
    const [step, setStep] = useState(0);
    const [f, setF] = useState(() => loaded?.form ?? DEFAULT_FORM);
    const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

    const [deploy, setDeploy] = useState({
        state: { status: 'idle', plan: null, progress: [], result: null, error: null },
    });

    // Re-entry: a field that couldn't be read, left as loaded, keeps its deployed value on save
    // (reentryValues) — so it doesn't have to pass the checks a replacement value does.
    const kept = (name) =>
        reentry &&
        !!loaded.errors[name] &&
        JSON.stringify(fromForm(f)[name]) === JSON.stringify(fromForm(loaded.form)[name]);

    // Steps: 0 Overview · 1 Variant · 2 CDN · 3 Routing · 4 Store · 5 Secrets
    //        6 TOTP settings · 7 Branding · 8 Review
    const canAdvance = useMemo(() => {
        switch (step) {
            case 0:
                return !!f.name.trim();
            case 1:
                return f.variant === 'A' || (f.variant === 'B' && !!f.proofKey);
            case 2:
                return !!f.cdn;
            case 3:
                return (
                    (!!f.audience.trim() || kept('audience')) &&
                    ((f.authPrefix.startsWith('/') && f.authPrefix.length > 1) || kept('authPrefix')) &&
                    (f.protectionScope === 'all' ||
                        (f.protectionScope === 'paths' && parseProtectedPaths(f.protectedPaths).length > 0) ||
                        kept('protection'))
                );
            case 4:
                return !!f.store || kept('store');
            case 5:
                return ['sessionKey', 'handoff', 'enroll', 'gcore'].every((k) => !!f[k] || kept(k));
            case 6:
                return true; // all optional
            case 7:
                return true; // all optional
            case 8:
                return (
                    deploy.state.status === 'idle' ||
                    (deploy.state.status === 'error' && deploy.state.result?.status !== 'partial')
                );
            default:
                return false;
        }
    }, [step, f, deploy]);

    async function handleFinish() {
        // One path for both modes: save the form into the deployment (a fresh skeleton, or the live
        // state on Re-entry), then send it — the field map leaves everything it doesn't own alone.
        const base = reentry
            ? current
            : skeleton({ name: f.name, filterT, appT, cdnResourceId: f.cdn.id });
        const values = reentry ? reentryValues(f, loaded.form, loaded.errors) : fromForm(f);
        let planParams;
        try {
            planParams = toPlan(fields.save(values, base), current?.revision);
        } catch (err) {
            setDeploy({ state: { status: 'error', plan: null, progress: [], result: null, error: err.message } });
            return;
        }

        setDeploy({ state: { status: 'planning', plan: null, progress: [], result: null, error: null } });
        try {
            const result = await session.deployment.deploy(planParams, {
                onPlan: (plan) => setDeploy((d) => ({ state: { ...d.state, status: 'applying', plan } })),
                onProgress: (ev) => setDeploy((d) => ({ state: { ...d.state, progress: [...d.state.progress, ev] } })),
            });
            // Only a complete apply finishes the wizard. rolled_back left nothing behind, so it can be retried;
            // partial did (or changed the revision), so a retry would duplicate it or be refused — reopen instead.
            setDeploy((d) => ({
                state: {
                    ...d.state,
                    status: result.status === 'complete' ? 'done' : 'error',
                    result,
                    error: result.status === 'partial' ? PARTIAL_APPLY : null,
                },
            }));
        } catch (err) {
            if (err instanceof WizardError && err.code === 'user_cancelled') {
                setDeploy({ state: { status: 'idle', plan: null, progress: [], result: null, error: null } });
            } else {
                setDeploy((d) => ({ state: { ...d.state, status: 'error', error: err.message } }));
            }
        }
    }

    return (
        <WizardShell
            canAdvance={canAdvance}
            finished={deploy.state.status === 'done'}
            labels={{ finish: 'Deploy', finished: 'Finished' }}
            onNavigated={(e) => setStep(e.detail.to)}
            onFinish={handleFinish}
            onWizardFinished={() => session.wizard.finish()}
        >
            <WizardStep title="Overview">
                <StepOverview
                    f={f}
                    set={set}
                    filterT={filterT}
                    appT={appT}
                    reentry={reentry}
                    locks={locks}
                    loadErrors={loaded?.errors}
                />
            </WizardStep>
            <WizardStep title="Variant">
                <StepVariant
                    session={session}
                    f={f}
                    set={set}
                    reentry={reentry}
                    locks={locks}
                />
            </WizardStep>
            <WizardStep title="CDN resource">
                <StepCdn
                    session={session}
                    f={f}
                    set={set}
                    reentry={reentry}
                    locks={locks}
                />
            </WizardStep>
            <WizardStep title="Routing & tokens">
                <StepRouting
                    f={f}
                    set={set}
                    reentry={reentry}
                    locks={locks}
                />
            </WizardStep>
            <WizardStep title="Edge Storage">
                <StepStore
                    session={session}
                    f={f}
                    set={set}
                    reentry={reentry}
                    locks={locks}
                />
            </WizardStep>
            <WizardStep title="Secrets">
                <StepSecrets
                    session={session}
                    f={f}
                    set={set}
                    reentry={reentry}
                    locks={locks}
                />
            </WizardStep>
            <WizardStep title="TOTP settings">
                <StepTotpSettings
                    f={f}
                    set={set}
                    locks={locks}
                />
            </WizardStep>
            <WizardStep title="Branding">
                <StepBranding
                    f={f}
                    set={set}
                />
            </WizardStep>
            <WizardStep title="Review">
                <StepReview
                    f={f}
                    deploy={deploy}
                    filterT={filterT}
                    appT={appT}
                />
            </WizardStep>
        </WizardShell>
    );
}

// ── App entry ────────────────────────────────────────────────────────────

function App() {
    const [state, setState] = useState({ status: 'connecting' });

    useEffect(() => {
        let session;
        (async () => {
            try {
                session = await connect({ expectedHostOrigin: hostOrigin });
                const ctx = await session.context.get();

                if (ctx.launchTemplateId === null) {
                    // Re-entry: the deployment is the source of truth. The apps stand in for the
                    // templates on the Overview (same name/api_type shape).
                    const current = await session.deployment.current();
                    const byRef = (ref) => current.fastedgeApps.find((a) => a.ref === ref);
                    setState({ status: 'ready', session, current, filterT: byRef('filter'), appT: byRef('app') });
                    return;
                }
                // Identify both templates by api_type — never by hard-coded id.
                const ids = [ctx.launchTemplateId, ...ctx.companionTemplateIds];
                const details = await Promise.all(ids.map((id) => session.fastedge.templates.read({ id })));
                const filterT = details.find((t) => t.api_type === 'proxy-wasm');
                const appT = details.find((t) => t.api_type === 'wasi-http');

                if (!filterT || !appT) {
                    session?.dispose();
                    setState({
                        status: 'error',
                        error: 'Expected one proxy-wasm filter and one wasi-http app. Check companion templates.',
                    });
                    return;
                }
                setState({ status: 'ready', session, current: null, filterT, appT });
            } catch (err) {
                setState({ status: 'error', error: `${err.code ?? 'error'}: ${err.message}` });
            } finally {
                // Reveal the root for *every* terminal state — error messages render
                // into #root too, so leaving it hidden on failure shows a blank page.
                document.getElementById('root').hidden = false;
            }
        })();
        return () => session?.dispose();
    }, []);

    if (state.status === 'connecting') return <p>Connecting…</p>;
    if (state.status === 'error') return <p className="wizard-error">{state.error}</p>;
    return (
        <Wizard
            session={state.session}
            current={state.current}
            filterT={state.filterT}
            appT={state.appT}
        />
    );
}

createRoot(document.getElementById('root')).render(<App />);
