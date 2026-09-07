import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { handleCallback } from './handleCallback.js';
import { useAuth } from './AuthContext.js';
import type { AuthClient } from './createAuthClient.js';
import type { CallbackResult } from './handleCallback.js';

export interface AuthCallbackProps {
    readonly client: AuthClient;
    /**
     * How this app navigates. The signature is react-router's `useNavigate()`,
     * so that case needs no adapter — but it is a prop rather than a hook call
     * because **this package must not depend on a router.** One of the two UIs
     * in this repo has none at all, and a future one that is a single screen
     * behind a login should not be made to adopt one to get a callback route.
     */
    readonly navigate: (path: string, options: { replace: boolean }) => void;
    /** Where to land when the IdP returned no usable path — the app's home route. */
    readonly defaultPath: string;
    /**
     * The router's basename, when the app is mounted under a sub-path.
     *
     * The return path arrives as a full pathname and the router prepends its
     * basename again, so an app at `/qr-manager` would navigate to
     * `/qr-manager/qr-manager/admin` — a 404 on every session renewal.
     */
    readonly basePath?: string;
    /** Shown while the code is being exchanged. */
    readonly pending?: ReactNode;
    /** Shown when the exchange failed and the user should retry. */
    readonly failed?: ReactNode;
}

/**
 * The registered redirect URI, as a component an app can mount on its callback
 * route. Always a top-level return — there is no iframe variant, because
 * Authentik refuses to be framed at all.
 *
 * ```tsx
 * // The whole of an app's callback route.
 * const CallbackPage = ({ client }: { client: AuthClient }) => (
 *     <AuthCallback client={client} navigate={useNavigate()} defaultPath="/admin" />
 * );
 * ```
 *
 * It lives here rather than in each app because everything it does is a trap
 * that has already been fallen into once: the single-use code that StrictMode
 * exchanges twice, the `no-session` outcome that must settle the provider or the
 * app hangs on Loading… forever, the return path that has to survive a renewal,
 * and the basename the router prepends a second time. None of that is
 * app-specific, and all of it fails quietly.
 *
 * Three outcomes, and only one of them is an error:
 *  - signed-in  the code was exchanged; go where the user was headed
 *  - no-session the prompt=none probe found no SSO session. Ordinary: fall
 *               through to the app, which renders the sign-in page
 *  - failed     a replayed code or a stale state entry. Offer a retry
 */
export const AuthCallback = ({
    client,
    navigate,
    defaultPath,
    basePath = '/',
    pending = <p>Signing in…</p>,
    failed = <p role="alert">Sign-in could not be completed. Reload the page to try again.</p>
}: AuthCallbackProps) => {
    const { resolveAnonymous } = useAuth();
    const [result, setResult] = useState<CallbackResult | undefined>();
    /**
     * An authorization code is single-use: exchanging it twice returns 400
     * invalid_grant. StrictMode double-invokes effects, so without this the
     * second run fails and can flash the retry screen at a user who is already
     * signed in. Observed as a 400 on every dev login.
     */
    const started = useRef(false);

    useEffect(() => {
        if (started.current) {
            return;
        }
        started.current = true;

        void handleCallback(client).then(({ result: outcome, returnTo }) => {
            setResult(outcome);
            if (outcome === 'signed-in') {
                // Where the user was when the redirect began, not the landing
                // page. Renewal is a redirect too, so without this every session
                // renewal quietly throws away whatever they were doing.
                navigate(routePathOf(returnTo, basePath) ?? defaultPath, { replace: true });
                return;
            }
            if (outcome === 'no-session') {
                // No userLoaded event is coming, so the provider must be told to
                // settle — otherwise it waits forever and the app shows Loading…
                // where the sign-in page belongs.
                resolveAnonymous();
                navigate(defaultPath, { replace: true });
            }
        });
    }, [client, navigate, resolveAnonymous, basePath, defaultPath]);

    return result === 'failed' ? <>{failed}</> : <>{pending}</>;
};

/**
 * Converts the absolute pathname captured before the redirect into the
 * router-relative path the app's `navigate` expects.
 *
 * Returns undefined for the callback route itself, which would otherwise loop.
 */
export const routePathOf = (returnTo: string | undefined, basePath: string): string | undefined => {
    if (returnTo === undefined) {
        return undefined;
    }

    const base = basePath.replace(/\/$/, '');
    const path = base && returnTo.startsWith(base) ? returnTo.slice(base.length) : returnTo;
    const normalised = path.startsWith('/') ? path : `/${path}`;

    return normalised.startsWith('/callback') ? undefined : normalised;
};
