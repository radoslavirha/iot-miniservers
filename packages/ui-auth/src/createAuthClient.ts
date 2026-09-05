import { InMemoryWebStorage, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { AuthConfig } from './AuthConfig.js';

export type AuthClient = UserManager;

/**
 * Every Authentik-specific decision lives here, so the rest of the app — and
 * any future UI — sees one ordinary OIDC client.
 *
 * NOTHING HERE USES AN IFRAME, and that is the whole shape of this file.
 * Authentik sets `X-Frame-Options: DENY` on every response, verified in a real
 * browser on 2026-09-05:
 *
 *     Refused to display 'https://auth.irha.cz/' in a frame because it set
 *     'X-Frame-Options' to 'deny'.
 *
 * A 302 passes through a frame unblocked, so the hidden-iframe strategy appears
 * to work right up until Authentik renders an actual page — the login flow, or
 * the "Permission denied" page for a user outside the group. Every renewal and
 * every session recovery is therefore a TOP-LEVEL navigation. `check_session_iframe`
 * is absent from discovery, which says the same thing.
 *
 * The settings that are not defaults, and why:
 *
 * - `metadataUrl` is built explicitly instead of letting the library join
 *   `authority` with the well-known path. The issuer carries a trailing slash
 *   and is per application; spelling the URL out removes the join from the
 *   list of things that can be subtly wrong.
 * - `userStore` is in-memory. The access token lives minutes and there is no
 *   refresh token; putting either in localStorage would hand an XSS the whole
 *   session for nothing in return.
 * - `stateStore` is left at its default (localStorage). It holds the PKCE
 *   `code_verifier` for the seconds between leaving for the IdP and coming
 *   back, and it MUST survive that full-page navigation — in-memory here would
 *   break every login. It is not a token and it is consumed once.
 * - `automaticSilentRenew` is OFF. It renews through a hidden iframe, which
 *   cannot work here. Renewal is driven by the provider instead, as a
 *   top-level `prompt=none` redirect.
 * - `monitorSession` is OFF: session monitoring is also an iframe, and
 *   Authentik publishes no `check_session_iframe` to point it at.
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
        automaticSilentRenew: false,
        monitorSession: false,
        // Claims come from the token; a userinfo round trip would add a request
        // per login and tell us nothing extra.
        loadUserInfo: false
    });
