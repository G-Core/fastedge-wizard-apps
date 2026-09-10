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

const hostOrigin = new URLSearchParams(location.search).get('hostOrigin') || 'https://portal.gcore.com';

// Escape a user-supplied path prefix for safe use inside a CDN rule regex —
// otherwise metacharacters (e.g. the '.' in "/auth.v2") match more broadly than
// the literal path the user typed.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseProtectedPaths = (raw) =>
    raw
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 1 && p.startsWith('/'));

// ── Wizard root ────────────────────────────────────────────────────────────

function Wizard({ session, ctx, filterT, appT }) {
    const [step, setStep] = useState(0);
    const [f, setF] = useState({
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
        totpIssuer: 'TOTP',
        totpDigits: '6',
        totpPeriod: '30',
        totpAlgo: 'SHA1',
        totpDrift: '1',
        // Session & policy
        policyMode: 'default',
        sessionTtl: '28800',
        maxAttempts: '5',
        ticketTtl: '90',
        kvPrefix: 'totp:',
        selfEnroll: 'true',
        // Branding
        brandMode: 'none',
        brandName: '',
        brandLogo: '',
        brandFavicon: '',
        brandColor: '#0066cc',
        brandHover: '',
    });
    const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

    const [deploy, setDeploy] = useState({
        state: { status: 'idle', plan: null, progress: [], result: null, error: null },
    });

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
                    !!f.audience.trim() &&
                    f.authPrefix.startsWith('/') &&
                    f.authPrefix.length > 1 &&
                    (f.protectionScope === 'all' ||
                        (f.protectionScope === 'paths' && parseProtectedPaths(f.protectedPaths).length > 0))
                );
            case 4:
                return !!f.store;
            case 5:
                return !!(f.sessionKey && f.handoff && f.enroll && f.gcore);
            case 6:
                return true; // all optional
            case 7:
                return true; // all optional
            case 8:
                return deploy.state.status === 'idle' || deploy.state.status === 'error';
            default:
                return false;
        }
    }, [step, f, deploy]);

    async function handleFinish() {
        const sharedEnv = {
            AUTH_PREFIX: f.authPrefix,
            MFA_AUDIENCE: f.audience,
            MFA_SESSION_COOKIE: f.cookie,
            ...(f.issuer ? { MFA_ISSUER: f.issuer } : {}),
        };

        const totpEnv =
            f.totpMode === 'custom'
                ? {
                      TOTP_ISSUER: f.totpIssuer,
                      TOTP_DIGITS: f.totpDigits,
                      TOTP_PERIOD: f.totpPeriod,
                      TOTP_ALGORITHM: f.totpAlgo,
                      TOTP_DRIFT: f.totpDrift,
                  }
                : {};

        const policyEnv =
            f.policyMode === 'custom'
                ? {
                      MFA_SESSION_TTL: f.sessionTtl,
                      MAX_ATTEMPTS: f.maxAttempts,
                      TICKET_TTL: f.ticketTtl,
                      KV_KEY_PREFIX: f.kvPrefix,
                      ALLOW_SELF_ENROLLMENT: f.selfEnroll,
                  }
                : {};

        const brandEnv =
            f.brandMode === 'custom'
                ? {
                      ...(f.brandName ? { TOTP_BRAND_NAME: f.brandName } : {}),
                      ...(f.brandLogo ? { TOTP_BRAND_LOGO_URL: f.brandLogo } : {}),
                      ...(f.brandFavicon ? { TOTP_BRAND_FAVICON_URL: f.brandFavicon } : {}),
                      ...(f.brandColor !== '#0066cc' ? { TOTP_BRAND_BUTTON_COLOR: f.brandColor } : {}),
                      ...(f.brandHover ? { TOTP_BRAND_BUTTON_HOVER_COLOR: f.brandHover } : {}),
                  }
                : {};

        const variantBExtras =
            f.variant === 'B'
                ? {
                      ...(f.proofTtl !== '90' ? { PROOF_TTL: f.proofTtl } : {}),
                      ...(f.proofCookie !== 'mfa_proof' ? { MFA_PROOF_COOKIE: f.proofCookie } : {}),
                  }
                : {};

        const appEnv = {
            // Read access to the seed store comes from storeRefs below (the platform-level
            // binding KvStore.open("TOTP_USER_SEEDS") needs) — KV_STORE_ID here is only for
            // the write-via-API path, which the fastedge::kv binding can't do.
            KV_STORE_ID: String(f.store.id),
            ...(f.variant === 'B' ? { MFA_PROOF_PUBLIC_JWK: f.proofKey.publicKey } : {}),
            ...totpEnv,
            ...policyEnv,
            ...brandEnv,
            ...variantBExtras,
        };

        const appSecrets = {
            MFA_SESSION_KEY: f.sessionKey.id,
            HANDOFF_KEY: f.handoff.id,
            ENROLL_API_KEY: f.enroll.id,
            GCORE_API_TOKEN: f.gcore.id,
            ...(f.variant === 'B' ? { MFA_PROOF_SIGNING_KEY: f.proofKey.id } : {}),
        };

        // Grants the app's fastedge::kv binding access to the selected store, under the
        // fixed param name the template declares (registry.json TOTP_USER_SEEDS, data_type
        // "store"). Env vars alone never do this — see wizard-sdk docs/quickstart.md.
        const appStoreRefs = { TOTP_USER_SEEDS: f.store.id };

        // Protection scope: either one catch-all rule, or one rule per protected path prefix.
        // Every rule binds the same filter app — the filter self-bypasses AUTH_PREFIX + /health
        // internally regardless of which CDN rule(s) route to it.
        const filterRules =
            f.protectionScope === 'all'
                ? [
                      {
                          // Match every path (the CDN API rejects a rule of only slashes, so not '^/').
                          ref: 'filter-rule',
                          name: `${f.name}-mfa-filter`,
                          rule: '^/.*',
                          weight: 1,
                          fastedgeFilter: { appRef: 'filter', hook: 'on_request_headers', interruptOnError: true },
                      },
                  ]
                : parseProtectedPaths(f.protectedPaths)
                      .map((path, i) => ({
                          ref: `filter-rule-${i}`,
                          name: `${f.name}-mfa-filter-${i + 1}`,
                          rule: `^${escapeRegex(path)}`,
                          weight: 1,
                          fastedgeFilter: { appRef: 'filter', hook: 'on_request_headers', interruptOnError: true },
                      }));

        const planParams = {
            fastedgeApps: [
                {
                    ref: 'filter',
                    name: `${f.name}-filter`,
                    api_type: 'proxy-wasm',
                    source: { fromTemplateId: filterT.id },
                    env: { ...(f.loginUrl ? { MFA_LOGIN_URL: f.loginUrl } : {}) },
                    secretRefs: { MFA_SESSION_KEY: f.sessionKey.id },
                },
                {
                    ref: 'app',
                    name: `${f.name}-app`,
                    api_type: 'wasi-http',
                    source: { fromTemplateId: appT.id },
                    env: appEnv,
                    secretRefs: appSecrets,
                    storeRefs: appStoreRefs,
                },
            ],
            sharedEnv,
            cdnResourceId: f.cdn.id,
            newCdnOrigins: [{ ref: 'app-origin', name: `${f.name}-app-origin`, appRef: 'app' }],
            newCdnRules: [
                // Route the login/challenge paths to the app origin.
                {
                    ref: 'app-route',
                    name: `${f.name}-auth-route`,
                    rule: `^${escapeRegex(f.authPrefix)}`,
                    weight: 10,
                    originGroupRef: 'app-origin',
                },
                ...filterRules,
            ],
        };

        setDeploy({ state: { status: 'planning', plan: null, progress: [], result: null, error: null } });
        try {
            const result = await session.deployment.deploy(planParams, {
                onPlan: (plan) => setDeploy((d) => ({ state: { ...d.state, status: 'applying', plan } })),
                onProgress: (ev) => setDeploy((d) => ({ state: { ...d.state, progress: [...d.state.progress, ev] } })),
            });
            setDeploy((d) => ({ state: { ...d.state, status: 'done', result } }));
        } catch (err) {
            if (err instanceof WizardError && err.code === 'user_cancelled') {
                setDeploy((d) => ({ state: { ...d.state, status: 'idle' } }));
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
                />
            </WizardStep>
            <WizardStep title="Variant">
                <StepVariant
                    session={session}
                    f={f}
                    set={set}
                />
            </WizardStep>
            <WizardStep title="CDN resource">
                <StepCdn
                    session={session}
                    f={f}
                    set={set}
                />
            </WizardStep>
            <WizardStep title="Routing & tokens">
                <StepRouting
                    f={f}
                    set={set}
                />
            </WizardStep>
            <WizardStep title="Edge Storage">
                <StepStore
                    session={session}
                    f={f}
                    set={set}
                />
            </WizardStep>
            <WizardStep title="Secrets">
                <StepSecrets
                    session={session}
                    f={f}
                    set={set}
                />
            </WizardStep>
            <WizardStep title="TOTP settings">
                <StepTotpSettings
                    f={f}
                    set={set}
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
                    session?.dispose();
                    setState({
                        status: 'error',
                        error: 'Opened in re-entry mode — launch from the TOTP template to deploy.',
                    });
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
                setState({ status: 'ready', session, ctx, filterT, appT });
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
            ctx={state.ctx}
            filterT={state.filterT}
            appT={state.appT}
        />
    );
}

createRoot(document.getElementById('root')).render(<App />);
