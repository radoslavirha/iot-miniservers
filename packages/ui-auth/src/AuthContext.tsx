import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from 'oidc-client-ts';
import type { AuthClient } from './createAuthClient.js';

/**
 * `loading` covers both "asking the IdP" and "about to navigate away", so the
 * app never renders itself while the answer is unknown.
 */
export type AuthState = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
    readonly state: AuthState;
    readonly username?: string;
    readonly roles: string[];
    login(): Promise<void>;
    /**
     * Ends the IdP session, not just this application's.
     *
     * That is a property of the provider's invalidation flow, configured in
     * homelab rather than here: it runs the user_logout stage and then honours
     * post_logout_redirect_uri. Pointed at the *provider* invalidation flow
     * instead, this would leave the session alive and Log out -> Log in would
     * sign the user straight back in with no prompt — which is why there is one
     * button here and not two.
     */
    logout(): Promise<void>;
    /**
     * Settles the provider as signed-out.
     *
     * The callback route owns its page load, so the provider deliberately does
     * not probe there and waits for the userLoaded event instead. When the
     * outcome is "no session" there IS no such event, and without this the
     * provider would wait forever — a permanent Loading… where the sign-in page
     * belongs. The callback reports that outcome here.
     */
    resolveAnonymous(): void;
    getAccessToken(): string | undefined;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Marks that this tab has already asked the IdP whether a session exists.
 *
 * Without it the anonymous case is an infinite redirect: load, prompt=none,
 * come back `login_required`, load, prompt=none... It holds no token and no
 * secret, only the fact that the question has been asked once.
 */
const SSO_ATTEMPTED = 'auth.sso-attempted';

/**
 * True while this page load IS the return leg of an authorization redirect.
 *
 * The provider must not probe here. The code in the URL has not been exchanged
 * yet, and probing navigates the page away before the callback handler can run
 * — which loops: sign in, come back with a code, get redirected off before the
 * exchange, come back again, and so on.
 *
 * Reading the query directly keeps this self-contained; the alternative is
 * teaching this package the app's route names.
 */
const isHandlingCallback = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    return params.has('code') || params.has('error');
};

const ssoAlreadyAttempted = (): boolean => {
    try {
        return window.sessionStorage.getItem(SSO_ATTEMPTED) === '1';
    } catch {
        // Private mode, or storage blocked. Better to skip the SSO probe than
        // to risk the redirect loop it guards.
        return true;
    }
};

const rememberSsoAttempt = (value: boolean): void => {
    try {
        if (value) {
            window.sessionStorage.setItem(SSO_ATTEMPTED, '1');
        } else {
            window.sessionStorage.removeItem(SSO_ATTEMPTED);
        }
    } catch {
        // Nothing to do; the guard degrades to "do not probe".
    }
};

export const AuthProvider = ({ client, children }: { client: AuthClient; children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [state, setState] = useState<AuthState>('loading');

    useEffect(() => {
        let cancelled = false;

        const adopt = (next: User | null) => {
            if (cancelled) {
                return;
            }
            setUser(next);
            setState(next ? 'authenticated' : 'anonymous');
        };

        const recover = async () => {
            // Mid-handshake: CallbackPage owns this page load. Stay `loading`
            // and wait for the userLoaded event rather than navigating away.
            if (isHandlingCallback()) {
                return;
            }

            const existing = await client.getUser();
            if (existing && !existing.expired) {
                rememberSsoAttempt(false);
                adopt(existing);
                return;
            }

            // Nothing in memory. Ask the IdP whether this browser already has a
            // session — this is what makes SSO work: signed in at another app,
            // the redirect returns a code and no login form is ever shown.
            //
            // It is a TOP-LEVEL navigation, not an iframe: Authentik sets
            // X-Frame-Options: DENY. The page is leaving, so the state stays
            // `loading` and the app never flashes its anonymous shell.
            // `cancelled` is checked here too, not only in adopt(): StrictMode
            // runs this effect twice, and a discarded run must not navigate the
            // page out from under the live one.
            if (!ssoAlreadyAttempted() && !cancelled) {
                rememberSsoAttempt(true);
                await client.signinRedirect({ prompt: 'none', state: { returnTo: window.location.pathname } });
                return;
            }

            adopt(null);
        };

        void recover().catch(() => adopt(null));

        const onLoaded = (next: User) => {
            rememberSsoAttempt(false);
            adopt(next);
        };
        const onUnloaded = () => adopt(null);
        client.events.addUserLoaded(onLoaded);
        client.events.addUserUnloaded(onUnloaded);

        return () => {
            cancelled = true;
            client.events.removeUserLoaded(onLoaded);
            client.events.removeUserUnloaded(onUnloaded);
        };
    }, [client]);

    const login = useCallback(async () => {
        // An explicit click, so no prompt=none: the user is asking to be shown
        // the login form if they need one.
        rememberSsoAttempt(false);
        await client.signinRedirect({ state: { returnTo: window.location.pathname } });
    }, [client]);

    const logout = useCallback(async () => {
        rememberSsoAttempt(true);
        await client.signoutRedirect();
    }, [client]);

    const resolveAnonymous = useCallback(() => {
        setUser(null);
        setState(current => (current === 'authenticated' ? current : 'anonymous'));
    }, []);

    const getAccessToken = useCallback(() => user?.access_token, [user]);

    const value = useMemo<AuthContextValue>(
        () => ({
            state,
            username: user?.profile.preferred_username,
            roles: (user?.profile.roles as string[] | undefined) ?? [],
            login,
            logout,
            resolveAnonymous,
            getAccessToken
        }),
        [state, user, login, logout, resolveAnonymous, getAccessToken]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
    const value = useContext(AuthContext);
    if (!value) {
        throw new Error('useAuth called outside of <AuthProvider>.');
    }
    return value;
};
