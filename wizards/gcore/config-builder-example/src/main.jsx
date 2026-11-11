// Config builder example — the G-Core reference for a wizard that edits one complex JSON config.
// Template mode starts from an empty tree; Re-entry loads the deployed tree with the SDK field map
// (config.js) and saves it back. Pure logic lives in config.js; the tree editor in tree.jsx.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { connect, WizardError } from '@gcoredev/fastedge-wizard-sdk';
import '@gcore/wizard-step-kit'; // side-effect: registers the custom elements
import { DeployProgress, WizardShell, WizardStep } from '@gcore/wizard-step-kit/react';

import {
    ENV_KEY,
    MAX_CONFIG_BYTES,
    SIZE_WARN_BYTES,
    configBytes,
    emptyConfig,
    fields,
    skeleton,
    toPlan,
    updateNode,
    validate,
} from './config.js';
import { NodeEditor } from './tree.jsx';

const hostOrigin = new URLSearchParams(location.search).get('hostOrigin') || 'https://portal.gcore.com';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function Note({ kind = 'info', children }) {
    return <div className={`cb-note cb-note--${kind}`}>{children}</div>;
}

// ── Steps ────────────────────────────────────────────────────────────────────

function StepOverview({ name, setName, reentry, loadError, onReset }) {
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
            <label className="cb-field">
                <span>App name</span>
                <input type="text" value={name} disabled={reentry} onChange={(e) => setName(e.target.value)} />
            </label>
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
                    message is limited to 64 KB in total. Remove or merge branches.</Note>
            ) : bytes > SIZE_WARN_BYTES ? (
                <Note kind="warn">The config is close to the 64 KB a deployment message can carry. The
                    app should read it with the dictionary API (<code>dictionary::get</code>), which has no
                    per-variable size limit — plain environment reads stop at 64 KB.</Note>
            ) : null}
        </>
    );
}

function StepRoutes({ config, setConfig, errors }) {
    const count = Object.keys(errors).length;
    return (
        <>
            <h2 tabIndex={-1}>Routes</h2>
            <p className="cb-lede">Requests start at <strong>All requests</strong> and take the first matching
                condition, top to bottom. A branch with no matching child uses its fallback action.</p>
            <NodeEditor node={config.root} path="" errors={errors}
                onEdit={(path, fn) => setConfig((c) => updateNode(c, path, fn))} />
            {count > 0 && <Note kind="danger">{count} branch(es) need fixing before you can continue.</Note>}
            <details>
                <summary>Live JSON preview</summary>
                <pre className="cb-preview">{JSON.stringify(config, null, 2)}</pre>
            </details>
        </>
    );
}

function StepReview({ name, config, deploy }) {
    return (
        <>
            <h2 tabIndex={-1}>Review &amp; deploy</h2>
            <p className="cb-lede">App <strong>{name}</strong> gets this <code>{ENV_KEY}</code>. You confirm the
                change in a portal dialog before anything is written.</p>
            <SizeMeter bytes={configBytes(config)} />
            <pre className="cb-preview">{JSON.stringify(config, null, 2)}</pre>
            <DeployProgress state={deploy} />
        </>
    );
}

// ── Wizard root ──────────────────────────────────────────────────────────────

function Wizard({ session, template, current }) {
    const reentry = current !== null;
    const loaded = useMemo(() => (reentry ? fields.load(current) : null), [current, reentry]);
    const [name, setName] = useState(reentry ? current.fastedgeApps.find((a) => a.ref === 'main')?.name ?? '' : 'router');
    const [config, setConfig] = useState(() => loaded?.values.config ?? emptyConfig());
    const [loadError, setLoadError] = useState(loaded?.errors.config ?? null);
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
            const base = reentry ? current : skeleton({ name: name.trim(), templateId: template.id });
            planParams = toPlan(fields.save({ config }, base), current?.revision);
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
                <StepOverview name={name} setName={setName} reentry={reentry} loadError={loadError}
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
