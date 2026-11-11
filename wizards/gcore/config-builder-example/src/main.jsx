// Config builder example — the G-Core reference for a wizard that edits one complex JSON config.
//   deployment.js  how the form binds to the app (start here)
//   config.js      the config format: validation, upgrade, tree edits
//   tree.jsx       the Routes step's outline + rule editor
// This file: boot (template mode vs Re-entry), the steps, and deploy.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { connect, WizardError } from '@gcoredev/fastedge-wizard-sdk';
import '@gcore/wizard-step-kit'; // side-effect: registers the custom elements
import { DeployProgress, Locked, WizardShell, WizardStep } from '@gcore/wizard-step-kit/react';

import {
    ENV_READ_LIMIT_BYTES,
    MAX_CONFIG_BYTES,
    SIZE_WARN_BYTES,
    configBytes,
    emptyConfig,
    nodeAt,
    updateNode,
    validate,
} from './config.js';
import { ENV_KEY, loadForm, lockedFields, toDeployPlan } from './deployment.js';
import { Outline, RuleEditor } from './tree.jsx';

const hostOrigin = new URLSearchParams(location.search).get('hostOrigin') || 'https://portal.gcore.com';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function Note({ kind = 'info', children }) {
    return <div className={`cb-note cb-note--${kind}`}>{children}</div>;
}

// ── Steps ────────────────────────────────────────────────────────────────────

function StepOverview({ name, setName, reentry, locks, loadError, onReset }) {
    return (
        <>
            <h2 tabIndex={-1}>{reentry ? 'Edit request routing' : 'Edge request router'}</h2>
            <p className="cb-lede">
                Build a routing tree for one FastEdge app: conditions (country, path, header, device) narrow
                each request, and every branch ends in an action — send to an origin, redirect, rewrite the
                path, or respond directly. The whole tree is saved as one JSON value in the app&apos;s{' '}
                <code>{ENV_KEY}</code> environment variable.
            </p>
            {reentry && !loadError && (
                <Note>You are editing a deployed router. Your changes replace its <code>{ENV_KEY}</code> when
                    you deploy; nothing else on the app changes.</Note>
            )}
            {loadError && (
                <Note kind="danger">
                    <strong>The deployed config could not be loaded</strong> ({loadError.code}): {loadError.message}.
                    {loadError.raw !== undefined && (
                        <>
                            <p>Deployed value:</p>
                            <pre className="cb-preview cb-raw">{typeof loadError.raw === 'string' ? loadError.raw : JSON.stringify(loadError.raw, null, 2)}</pre>
                        </>
                    )}
                    <p>Nothing is changed unless you deploy. To continue, start again from an empty config —
                        it replaces the value above when you deploy.</p>
                    <button type="button" onClick={onReset}>Start from an empty config</button>
                </Note>
            )}
            <Locked reason={locks.name}>
                <label className="cb-field">
                    <span>App name</span>
                    <input type="text" value={name} disabled={!!locks.name} onChange={(e) => setName(e.target.value)} />
                </label>
            </Locked>
        </>
    );
}

function SizeMeter({ bytes }) {
    return (
        <>
            <label className="cb-field">
                <span>Config size: {kb(bytes)} of {kb(MAX_CONFIG_BYTES)}</span>
                <meter className="cb-meter" min={0} max={MAX_CONFIG_BYTES} high={SIZE_WARN_BYTES} value={bytes} />
            </label>
            {bytes > MAX_CONFIG_BYTES ? (
                <Note kind="danger">The config is too large to deploy through the portal: a deployment
                    message is limited to 1 MB in total. Remove or merge branches.</Note>
            ) : bytes > SIZE_WARN_BYTES ? (
                <Note kind="warn">The config is close to the 1 MB a deployment message can carry.</Note>
            ) : null}
            {bytes > ENV_READ_LIMIT_BYTES && bytes <= MAX_CONFIG_BYTES && (
                <Note>Over 64 KB: the app must read this value with the dictionary API
                    (<code>dictionary::get</code>) — a plain environment read stops at 64 KB.</Note>
            )}
        </>
    );
}

function JsonPreview({ config }) {
    return (
        <details>
            <summary>{ENV_KEY} as JSON</summary>
            <pre className="cb-preview">{JSON.stringify(config, null, 2)}</pre>
        </details>
    );
}

function StepRoutes({ config, setConfig, errors }) {
    const [selected, setSelected] = useState('');
    const path = nodeAt(config, selected) ? selected : '';
    const count = Object.keys(errors).length;
    // add / move / remove: apply the change, then select the rule it returns
    const apply = (op) => {
        const next = op(config);
        setConfig(next.config);
        setSelected(next.path);
    };
    return (
        <>
            <h2 tabIndex={-1}>Routes</h2>
            <p className="cb-lede">Every request starts at <strong>All requests</strong>. Rules at the same level are
                checked in order (1, 2, 3…) and the first that matches wins; if none match, that level&apos;s{' '}
                <strong>Otherwise</strong> applies. Select a rule to edit it.</p>
            {count > 0 && <Note kind="danger">{count} rule(s) need fixing before you can continue.</Note>}
            <div className="cb-split">
                <Outline config={config} errors={errors} selected={path} onSelect={setSelected} apply={apply} />
                <RuleEditor config={config} path={path} errors={errors} apply={apply}
                    onEdit={(p, fn) => setConfig((c) => updateNode(c, p, fn))} />
            </div>
            <JsonPreview config={config} />
        </>
    );
}

function StepReview({ name, config, deploy }) {
    return (
        <>
            <h2 tabIndex={-1}>Review &amp; deploy</h2>
            <p className="cb-lede">App <strong>{name}</strong> gets this <code>{ENV_KEY}</code>. You confirm the
                change in a portal dialog before anything is written.</p>
            <Outline config={config} />
            <SizeMeter bytes={configBytes(config)} />
            <JsonPreview config={config} />
            <DeployProgress state={deploy} />
        </>
    );
}

// ── Wizard root ──────────────────────────────────────────────────────────────

function Wizard({ session, template, current }) {
    const reentry = current !== null;
    const [initial] = useState(() => loadForm(current)); // deployment.js: live deployment → form
    const locks = useMemo(() => lockedFields(current), [current]);
    const [name, setName] = useState(initial.name);
    const [config, setConfig] = useState(initial.config);
    const [loadError, setLoadError] = useState(initial.error);
    const [step, setStep] = useState(0);
    const [deploy, setDeploy] = useState({ status: 'idle', plan: null, progress: [], result: null, error: null });

    const errors = useMemo(() => validate(config), [config]);
    const bytes = useMemo(() => configBytes(config), [config]);

    const canAdvance = [
        !!name.trim() && !loadError,
        Object.keys(errors).length === 0 && bytes <= MAX_CONFIG_BYTES,
        deploy.status === 'idle' || deploy.status === 'error',
    ][step];

    async function handleFinish() {
        let planParams;
        try {
            // deployment.js: form → deploy params (create in template mode, update in Re-entry)
            planParams = toDeployPlan({ name: name.trim(), config }, { current, templateId: template?.id });
        } catch (err) {
            setDeploy({ status: 'error', plan: null, progress: [], result: null, error: err.message });
            return;
        }

        setDeploy({ status: 'planning', plan: null, progress: [], result: null, error: null });
        try {
            const result = await session.deployment.deploy(planParams, {
                onPlan: (plan) => setDeploy((d) => ({ ...d, status: 'applying', plan })),
                onProgress: (ev) => setDeploy((d) => ({ ...d, progress: [...d.progress, ev] })),
            });
            setDeploy((d) => ({ ...d, status: 'done', result }));
        } catch (err) {
            const cancelled = err instanceof WizardError && err.code === 'user_cancelled';
            setDeploy((d) => ({ ...d, status: cancelled ? 'idle' : 'error', error: cancelled ? null : err.message }));
        }
    }

    return (
        <WizardShell
            canAdvance={!!canAdvance}
            finished={deploy.status === 'done'}
            labels={{ finish: 'Deploy', finished: 'Finished' }}
            onNavigated={(e) => setStep(e.detail.to)}
            onFinish={handleFinish}
            onWizardFinished={() => session.wizard.finish()}
        >
            <WizardStep title="Overview">
                <StepOverview name={name} setName={setName} reentry={reentry} locks={locks} loadError={loadError}
                    onReset={() => {
                        setConfig(emptyConfig());
                        setLoadError(null);
                    }} />
            </WizardStep>
            <WizardStep title="Routes">
                <StepRoutes config={config} setConfig={setConfig} errors={errors} />
            </WizardStep>
            <WizardStep title="Review">
                <StepReview name={name} config={config} deploy={deploy} />
            </WizardStep>
        </WizardShell>
    );
}

// ── App entry ────────────────────────────────────────────────────────────────

function App() {
    const [state, setState] = useState({ status: 'connecting' });

    useEffect(() => {
        let session;
        (async () => {
            try {
                session = await connect({ expectedHostOrigin: hostOrigin });
                const ctx = await session.context.get();

                if (ctx.launchTemplateId === null) {
                    // Re-entry: the live deployment is the source of truth.
                    const current = await session.deployment.current();
                    setState({ status: 'ready', session, current, template: null });
                } else {
                    const template = await session.fastedge.templates.read({ id: ctx.launchTemplateId });
                    setState({ status: 'ready', session, current: null, template });
                }
            } catch (err) {
                setState({ status: 'error', error: `${err.code ?? 'error'}: ${err.message}` });
            } finally {
                // Reveal the root for every terminal state — errors render into #root too.
                document.getElementById('root').hidden = false;
            }
        })();
        return () => session?.dispose();
    }, []);

    if (state.status === 'connecting') return <p>Connecting…</p>;
    if (state.status === 'error') return <p className="wizard-error">{state.error}</p>;
    return <Wizard session={state.session} template={state.template} current={state.current} />;
}

createRoot(document.getElementById('root')).render(<App />);
