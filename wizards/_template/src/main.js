import { connect, WizardError } from '@gcoredev/fastedge-wizard-sdk';

// The portal appends ?hostOrigin=<its-own-origin> when it opens the wizard.
// connect() validates that the INIT message comes from exactly this origin —
// it rejects anything else. The fallback keeps the dev mock host working
// (which passes hostOrigin itself) and is never reached in a real portal.
const hostOrigin =
    new URLSearchParams(location.search).get('hostOrigin') || 'https://portal.gcore.com';
const main = document.querySelector('main');

try {
    const session = await connect({ expectedHostOrigin: hostOrigin });
    await session.context.get();
    main.hidden = false;

    document.querySelector('[data-action=submit]').addEventListener('click', async () => {
        try {
            await session.fastedge.apps.create({
                /* TODO: fill in name, api_type, source, env */
            });
        } catch (err) {
            if (!(err instanceof WizardError && err.code === 'user_cancelled')) throw err;
        }
    });
} catch (err) {
    console.error(err);
}
