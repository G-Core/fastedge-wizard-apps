import { useState } from 'react';
import { optional } from '@gcoredev/fastedge-wizard-sdk';
import { OptionalPanels, WizardPanel, ResourceRow } from '@gcore/wizard-step-kit/react';
import { Field } from '../components.jsx';

// Providers with a redirect URI we can derive ourselves — the auth app lives on
// the CDN resource picked in the previous step, so the callback path is known.
const REDIRECT_PROVIDERS = ['google', 'microsoft', 'facebook'];
const defaultRedirectUri = (cdn, authPrefix, key) => (cdn ? `https://${cdn.cname}${authPrefix}/callback/${key}` : '');

// A provider self-activates only if its secret is present — the wizard only ever
// writes creds for the providers selected here, so no separate on/off env is needed.
export function StepProviders({ session, f, set }) {
    const [busy, setBusy] = useState('');
    const p = f.providers;
    const setP = (key, patch) => set({ providers: { ...p, [key]: { ...p[key], ...patch } } });

    // Prefill the redirect URI when a provider is newly selected — the user can still edit it.
    const onSelectionChange = (sel) => {
        const added = sel.filter((key) => !f.selectedProviders.includes(key));
        const providers = { ...p };
        for (const key of added) {
            if (REDIRECT_PROVIDERS.includes(key) && !p[key].redirectUri) {
                providers[key] = { ...p[key], redirectUri: defaultRedirectUri(f.cdn, f.authPrefix, key) };
            }
        }
        set({ selectedProviders: sel, providers });
    };

    const pickSecret = (key, field, name, comment, label) => async () => {
        setBusy(`${key}.${field}`);
        try {
            const rs = await optional(() => session.fastedge.secrets.pickOrCreate({ name, comment, label }));
            if (rs && rs.length) setP(key, { [field]: rs[0] });
        } catch (err) {
            console.error(`${key} ${field} select failed:`, err);
        } finally {
            setBusy('');
        }
    };

    return (
        <>
            <h2 tabIndex={-1}>Identity providers</h2>
            <p className="sso-lede">
                Select one or more providers. Each selected provider needs its client
                credentials below — the login page shows only the providers you configure.
            </p>
            <OptionalPanels multiple onChange={onSelectionChange}>
                <WizardPanel value="google" label="Google">
                    <Field label="Client ID" value={p.google.clientId}
                        onChange={(v) => setP('google', { clientId: v })} />
                    <ResourceRow title="Client secret" value={p.google.clientSecret?.name}
                        set={!!p.google.clientSecret} onClear={() => setP('google', { clientSecret: null })}>
                        <button onClick={pickSecret('google', 'clientSecret', `${f.name}-google-secret`, 'Google OAuth client secret', 'Google client secret')}
                            disabled={!!busy}>Select</button>
                    </ResourceRow>
                    <Field label="Redirect URI" value={p.google.redirectUri}
                        onChange={(v) => setP('google', { redirectUri: v })}
                        hint="Pre-filled from the CDN resource and auth prefix — register this exact value in Google Cloud Console, or edit it if you're using a different one." />
                </WizardPanel>
                <WizardPanel value="github" label="GitHub">
                    <Field label="Client ID" value={p.github.clientId}
                        onChange={(v) => setP('github', { clientId: v })} />
                    <ResourceRow title="Client secret" value={p.github.clientSecret?.name}
                        set={!!p.github.clientSecret} onClear={() => setP('github', { clientSecret: null })}>
                        <button onClick={pickSecret('github', 'clientSecret', `${f.name}-github-secret`, 'GitHub OAuth client secret', 'GitHub client secret')}
                            disabled={!!busy}>Select</button>
                    </ResourceRow>
                </WizardPanel>
                <WizardPanel value="microsoft" label="Microsoft">
                    <Field label="Client ID" value={p.microsoft.clientId}
                        onChange={(v) => setP('microsoft', { clientId: v })} />
                    <ResourceRow title="Client secret" value={p.microsoft.clientSecret?.name}
                        set={!!p.microsoft.clientSecret} onClear={() => setP('microsoft', { clientSecret: null })}>
                        <button onClick={pickSecret('microsoft', 'clientSecret', `${f.name}-microsoft-secret`, 'Microsoft OAuth client secret', 'Microsoft client secret')}
                            disabled={!!busy}>Select</button>
                    </ResourceRow>
                    <Field label="Redirect URI" value={p.microsoft.redirectUri}
                        onChange={(v) => setP('microsoft', { redirectUri: v })}
                        hint="Pre-filled from the CDN resource and auth prefix — register this exact value in the Azure app registration, or edit it if you're using a different one." />
                    <Field label="Tenant" value={p.microsoft.tenant}
                        onChange={(v) => setP('microsoft', { tenant: v })}
                        hint="Tenant ID, domain, or common/organizations/consumers. Default: common" />
                    <Field label="Allowed tenants (optional)" value={p.microsoft.allowedTenants}
                        onChange={(v) => setP('microsoft', { allowedTenants: v })}
                        hint="Comma-separated tenant IDs that may sign in. Strongly recommended when Tenant is a wildcard." />
                </WizardPanel>
                <WizardPanel value="facebook" label="Facebook">
                    <Field label="Client ID" value={p.facebook.clientId}
                        onChange={(v) => setP('facebook', { clientId: v })} />
                    <ResourceRow title="Client secret" value={p.facebook.clientSecret?.name}
                        set={!!p.facebook.clientSecret} onClear={() => setP('facebook', { clientSecret: null })}>
                        <button onClick={pickSecret('facebook', 'clientSecret', `${f.name}-facebook-secret`, 'Facebook OAuth client secret', 'Facebook client secret')}
                            disabled={!!busy}>Select</button>
                    </ResourceRow>
                    <Field label="Redirect URI" value={p.facebook.redirectUri}
                        onChange={(v) => setP('facebook', { redirectUri: v })}
                        hint="Pre-filled from the CDN resource and auth prefix — register this exact value in the Facebook app, or edit it if you're using a different one." />
                </WizardPanel>
                <WizardPanel value="saml" label="SAML">
                    <p>SAML is an older, XML-based SSO protocol common with enterprise identity
                        providers (Okta, Azure AD, ADFS, OneLogin) that don&apos;t offer OAuth.
                        There&apos;s no client ID/secret pair — instead your IdP and this
                        deployment (the &quot;service provider,&quot; or SP) each have an{' '}
                        <strong>entity ID</strong> (a stable identifier, not a secret) and a couple
                        of fixed URLs, exchanged once with your IdP admin when you set this up.</p>
                    <Field label="IdP SSO URL" value={p.saml.idpSsoUrl}
                        onChange={(v) => setP('saml', { idpSsoUrl: v })}
                        hint="Where your IdP sends users to sign in — get this from your IdP admin console." />
                    <Field label="IdP entity ID" value={p.saml.idpEntityId}
                        onChange={(v) => setP('saml', { idpEntityId: v })}
                        hint="Your IdP's own identifier. Must exactly match the Issuer field in the signed responses it sends back — a mismatch here is the most common SAML setup failure." />
                    <ResourceRow title="IdP signing certificate" value={p.saml.idpCert?.name}
                        set={!!p.saml.idpCert} onClear={() => setP('saml', { idpCert: null })}>
                        <button onClick={pickSecret('saml', 'idpCert', `${f.name}-saml-cert`, 'SAML IdP signing certificate', 'IdP signing certificate')}
                            disabled={!!busy}>Select</button>
                    </ResourceRow>
                    <Field label="SP entity ID (optional)" value={p.saml.spEntityId}
                        onChange={(v) => setP('saml', { spEntityId: v })}
                        hint="This deployment's own identifier — you choose it, then register it with your IdP so it knows who's asking." />
                    <Field label="SP ACS URL (optional)" value={p.saml.spAcsUrl}
                        onChange={(v) => setP('saml', { spAcsUrl: v })}
                        placeholder={`https://<host>${f.authPrefix}/callback`}
                        hint="The callback URL your IdP sends the signed sign-in response to. Register it with your IdP — the default above is almost always correct." />
                    <Field label="Button label" value={p.saml.idpLabel}
                        onChange={(v) => setP('saml', { idpLabel: v })}
                        hint='Text shown on the SAML login button. Default: "SSO"' />
                    <Field label="Button icon URL (optional)" value={p.saml.idpIconUrl}
                        onChange={(v) => setP('saml', { idpIconUrl: v })} />
                </WizardPanel>
            </OptionalPanels>
        </>
    );
}
