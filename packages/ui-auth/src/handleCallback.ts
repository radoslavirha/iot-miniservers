import type { AuthClient } from './createAuthClient.js';

export type CallbackResult = 'signed-in' | 'silent' | 'failed';

/**
 * One registered redirect URI serves both jobs, because Authentik matches
 * redirect URIs strictly and a second path would simply be refused. So the
 * callback route has to work out which one it is running as: a top-level
 * return from a login, or the hidden iframe of a silent renewal.
 *
 * `isFramed` is injected so the branch is testable; the caller passes
 * `window.self !== window.top`.
 */
export const handleCallback = async (
    client: AuthClient,
    { isFramed }: { isFramed: boolean }
): Promise<CallbackResult> => {
    try {
        if (isFramed) {
            await client.signinSilentCallback();
            return 'silent';
        }
        await client.signinRedirectCallback();
        return 'signed-in';
    } catch {
        // A failed exchange is an ordinary outcome here — a replayed code, a
        // stale state entry, a user who withdrew consent. The page shows a
        // retry; it must not throw into the router.
        return 'failed';
    }
};
