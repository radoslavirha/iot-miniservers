import { InMemoryWebStorage, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { AuthConfig } from './AuthConfig.js';

export type AuthClient = UserManager;

/**
 * Every Authentik-specific decision lives here, so the rest of the app — and
 * any future UI — sees one ordinary OIDC client.
 *
 * The settings that are not defaults, and why:
 *
 * - `metadataUrl` is built explicitly instead of letting the library join
 *   `authority` with the well-known path. The issuer carries a trailing slash
 *   and is per application; spelling the URL out removes the join from the
 *   list of things that can be subtly wrong.
 * - `userStore` is in-memory. The access token lives 300 seconds and there is
 *   no refresh token; putting either in localStorage would hand an XSS the
 *   whole session for nothing in return. A reload re-obtains a token silently.
 * - `stateStore` is left at its default (localStorage). It holds the PKCE
 *   `code_verifier` for the seconds between leaving for the IdP and coming
 *   back, and it MUST survive that full-page navigation — in-memory here would
 *   break every login. It is not a token and it is consumed once.
 * - `silent_redirect_uri` is the same registered callback URI. Redirect
 *   matching is strict, so a dedicated `/silent-renew.html` would be refused
 *   at the authorization endpoint. The consequence is that the renew iframe
 *   loads the SPA's own index.html, which is why `main.tsx` branches on
 *   `window.self !== window.top` before rendering <App>.
 * - `silentRequestTimeoutInSeconds` is the trap-3 guard: a user with a valid
 *   session but no group membership gets a 200 HTML "Permission denied" page
 *   inside the iframe, which never posts anything back. Without a timeout the
 *   renewal hangs forever.
 */
export const createAuthClient = (config: AuthConfig): AuthClient =>
    new UserManager({
        authority: config.issuer,
        metadataUrl: `${config.issuer}.well-known/openid-configuration`,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        post_logout_redirect_uri: config.postLogoutRedirectUri,
        scope: config.scope,
        response_type: 'code',
        disablePKCE: false,
        userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
        automaticSilentRenew: true,
        silent_redirect_uri: config.redirectUri,
        silentRequestTimeoutInSeconds: 10,
        // Claims come from the token; a userinfo round trip would add a request
        // per login and tell us nothing extra.
        loadUserInfo: false,
        monitorSession: false
    });
