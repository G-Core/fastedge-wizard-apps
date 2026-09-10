// Side-effect import: registers <gc-wizard-shell>, <gc-wizard-step>, <gc-resource-row>,
// and <gc-deploy-progress> as custom elements.
import '@gcore/wizard-step-kit';
import { connect, optional, WizardError } from '@gcoredev/fastedge-wizard-sdk';

const hostOrigin =
    new URLSearchParams(location.search).get('hostOrigin') || 'https://portal.gcore.com';

const main = document.querySelector('main');
const shell = document.querySelector('gc-wizard-shell');
const appNameInput = document.getElementById('app-name');
const cdnRow = document.getElementById('cdn-row');
const pickButton = document.querySelector('[data-action=pick-resource]');
const deployProgress = document.getElementById('deploy-progress');
const reviewName = document.getElementById('review-name');
const reviewCdn = document.getElementById('review-cdn');

function setError(msg) {
    if (msg) shell.setAttribute('error', msg);
    else shell.removeAttribute('error');
}

let pickedResource = null;
let step = 0;
let deployState = { status: 'idle', plan: null, progress: [], result: null, error: null };

function setDeployState(patch) {
    deployState = { ...deployState, ...patch };
    deployProgress.state = deployState;
    shell.toggleAttribute('finished', deployState.status === 'done');
    updateCanAdvance();
}

function updateCanAdvance() {
    let ready;
    if (step === 0) ready = appNameInput.value.trim().length > 0;
    else if (step === 1) ready = !!pickedResource;
    else ready = deployState.status === 'idle' || deployState.status === 'error';
    shell.toggleAttribute('can-advance', ready);
    setError('');
}

function updateCdnRow() {
    cdnRow.toggleAttribute('set', !!pickedResource);
    if (pickedResource) cdnRow.setAttribute('value', `${pickedResource.cname} (#${pickedResource.id})`);
    else cdnRow.removeAttribute('value');
}

function populateReview() {
    reviewName.textContent = appNameInput.value.trim();
    reviewCdn.textContent = pickedResource ? `${pickedResource.cname} (#${pickedResource.id})` : '—';
}

let session;

try {
    session = await connect({ expectedHostOrigin: hostOrigin });
    const ctx = await session.context.get();
    document.body.classList.add(ctx.theme);
    main.hidden = false;

    // This template has no companion apps and no params — the wizard only needs the
    // single template it was launched for.
    if (ctx.launchTemplateId === null) {
        setError('This wizard must be launched from the html2md template.');
        shell.removeAttribute('can-advance');
        return;
    }

    updateCanAdvance();

    pickButton.addEventListener('click', async () => {
        pickButton.disabled = true;
        try {
            const r = await optional(() => session.cdn.resources.pick());
            if (r) {
                pickedResource = r;
                updateCdnRow();
                updateCanAdvance();
            }
        } catch (err) {
            console.error('CDN resource pick failed:', err);
        } finally {
            pickButton.disabled = false;
        }
    });

    cdnRow.addEventListener('clear', () => {
        pickedResource = null;
        updateCdnRow();
        updateCanAdvance();
    });

    appNameInput.addEventListener('input', updateCanAdvance);

    shell.addEventListener('navigated', ({ detail: { to } }) => {
        step = to;
        if (step === 2) populateReview();
        updateCanAdvance();
    });

    shell.addEventListener('finish', async () => {
        if (!pickedResource) return;

        setDeployState({ status: 'planning', plan: null, progress: [], result: null, error: null });
        shell.removeAttribute('can-advance');
        setError('');

        try {
            // Same app on all three handlers — the template's own conversion logic (see its
            // source repo) only does work when the response is HTML and the request asked for
            // Markdown; the other handlers are pass-through unless that condition holds.
            const result = await session.deployment.deploy(
                {
                    fastedgeApps: [
                        {
                            ref: 'html2md-filter',
                            name: `${appNameInput.value.trim()}-filter`,
                            api_type: 'proxy-wasm',
                            source: { fromTemplateId: ctx.launchTemplateId },
                        },
                    ],
                    cdnResourceId: pickedResource.id,
                    cdnResourceFastedgeHandlers: {
                        on_request_headers: { appRef: 'html2md-filter' },
                        on_response_headers: { appRef: 'html2md-filter' },
                        on_response_body: { appRef: 'html2md-filter' },
                    },
                },
                {
                    onPlan: (plan) => setDeployState({ status: 'applying', plan }),
                    onProgress: (ev) => setDeployState({ progress: [...deployState.progress, ev] }),
                },
            );
            setDeployState({ status: 'done', result });
        } catch (err) {
            if (err instanceof WizardError && err.code === 'user_cancelled') {
                setDeployState({ status: 'idle' });
            } else {
                setDeployState({ status: 'error', error: err.message });
                console.error(err);
            }
        } finally {
            updateCanAdvance();
        }
    });

    shell.addEventListener('wizard-finished', () => session.wizard.finish());
} catch (err) {
    const p = document.createElement('p');
    p.className = 'wizard-error';
    p.textContent = `${err.code ?? 'error'}: ${err.message}`;
    document.body.replaceChildren(p);
}

window.addEventListener('beforeunload', () => session?.dispose());
