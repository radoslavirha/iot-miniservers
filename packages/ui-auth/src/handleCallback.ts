import type { AuthClient } from './createAuthClient.js';

export type CallbackResult = 'signed-in' | 'no-session' | 'failed';

export interface CallbackOutcome {
    readonly result: CallbackResult;
    /**
     * Absolute pathname the user was on when the redirect began, when the IdP
     * returned one and it is safe to use.
     *
     * It matters because renewal is a redirect: without it, every renewal drops
     * whoever was mid-task back on the app's landing page, roughly twice an hour.
     */
    readonly returnTo?: string;
}

/**
 * Accepts only a same-origin absolute path.
 *
 * This value survives a round trip through the IdP and is read back out of
 * browser storage, so it is treated as untrusted: `//evil.test` is a
 * protocol-relative URL that a browser follows off-site, and it is one leading
 * slash away from a legitimate path. Anything else falls back to the app's
 * default.
 */
const safeReturnTo = (value: unknown): string | undefined =>
    typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : undefined;

/**
 * Completes the return leg of a top-level authorization redirect.
 *
 * There is no iframe branch here, and there was one until 2026-09-05. Authentik
 * sets `X-Frame-Options: DENY` on every response, so the hidden-iframe variant
 * cannot run at all — see createAuthClient for the full note.
 *
 * `no-session` is not a failure. It is the answer to a `prompt=none` attempt
 * made on load to pick up an existing SSO session: the IdP redirects back with
 * `error=login_required` to say "nobody is signed in here". The caller renders
 * a sign-in page. Treating it as an error would put an error screen in front of
 * every first-time visitor.
 */
export const handleCallback = async (client: AuthClient): Promise<CallbackOutcome> => {
    // Read the error before the exchange: signinRedirectCallback throws on an
    // error response, and `login_required` needs telling apart from a genuine
    // failure like a replayed code.
    const error = new URLSearchParams(window.location.search).get('error');
    if (error === 'login_required' || error === 'consent_required' || error === 'interaction_required') {
        return { result: 'no-session' };
    }

    try {
        const user = await client.signinRedirectCallback();
        return {
            result: 'signed-in',
            returnTo: safeReturnTo((user.state as { returnTo?: unknown } | undefined)?.returnTo)
        };
    } catch {
        // An ordinary outcome — a replayed code, a stale state entry, a user
        // who withdrew consent. The page shows a retry; it must not throw into
        // the router.
        return { result: 'failed' };
    }
};
