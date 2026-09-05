import { describe, expect, it } from 'vitest';
import { createAuthClient } from './createAuthClient.js';
import type { AuthConfig } from './AuthConfig.js';

const config: AuthConfig = {
    issuer: 'https://auth.irha.cz/application/o/qr-manager-server1-sandbox/',
    clientId: 'qr-manager-server1-sandbox',
    scope: 'openid profile email roles',
    redirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/callback',
    postLogoutRedirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/'
};

describe('createAuthClient', () => {
    it('passes the issuer through as the authority, trailing slash intact', () => {
        const { settings } = createAuthClient(config);
        expect(settings.authority).toBe(config.issuer);
    });

    it('builds the discovery URL from the issuer rather than letting the library guess', () => {
        const { settings } = createAuthClient(config);
        expect(settings.metadataUrl).toBe(`${config.issuer}.well-known/openid-configuration`);
    });

    it('is a public client using authorization code + PKCE', () => {
        const { settings } = createAuthClient(config);
        expect(settings.client_secret).toBeUndefined();
        expect(settings.response_type).toBe('code');
        expect(settings.disablePKCE).toBe(false);
    });

    it('keeps the user (and therefore the access token) out of web storage', async () => {
        // Asserted through behaviour rather than by reaching for the store's
        // private `_store` field, which does not type-check: the field exists on
        // several constituents and is private in some, so the intersection
        // reduces to `never` under tsc even though vitest runs it happily.
        window.localStorage.clear();
        window.sessionStorage.clear();

        const { settings } = createAuthClient(config);
        await settings.userStore.set('probe', 'value');

        // It stored the value somewhere...
        await expect(settings.userStore.get('probe')).resolves.toBe('value');
        // ...and that somewhere is not anything the browser persists. The store
        // prefixes its keys, so scan both stores rather than guess the spelling.
        expect(window.localStorage.length).toBe(0);
        expect(window.sessionStorage.length).toBe(0);
    });

    it('never renews through an iframe — Authentik sets X-Frame-Options: DENY', () => {
        // automaticSilentRenew is implemented with a hidden iframe, and every
        // Authentik response refuses to be framed. Renewal is a top-level
        // prompt=none redirect, driven by the provider.
        // `silent_redirect_uri` is deliberately not asserted: oidc-client-ts
        // defaults it to `redirect_uri`, so it is never undefined. It is simply
        // unreachable while automaticSilentRenew is off, and that flag is the
        // thing that actually decides whether an iframe is ever created.
        const { settings } = createAuthClient(config);
        expect(settings.automaticSilentRenew).toBe(false);
    });

    it('does not monitor the session — Authentik publishes no check_session_iframe we rely on', () => {
        const { settings } = createAuthClient(config);
        expect(settings.monitorSession).toBe(false);
    });
});
