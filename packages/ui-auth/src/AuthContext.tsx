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
    logout(): Promise<void>;
    /**
     * Ends the Authentik session itself. RP-initiated logout does NOT — it
     * returns to the post-logout URI with the session alive, so Log out
     * followed by Log in signs the user straight back in with no prompt.
     */
    signOutEverywhere(): void;
    getAccessToken(): string | undefined;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const IDP_INVALIDATION_URL = 'https://auth.irha.cz/flows/-/default/invalidation/';

/**
 * Marks that this tab has already asked the IdP whether a session exists.
 *
 * Without it the anonymous case is an infinite redirect: load, prompt=none,
 * come back `login_required`, load, prompt=none... It holds no token and no
 * secret, only the fact that the question has been asked once.
 */
const SSO_ATTEMPTED = 'auth.sso-attempted';

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
            if (!ssoAlreadyAttempted()) {
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

    const signOutEverywhere = useCallback(() => {
        rememberSsoAttempt(true);
        window.location.assign(IDP_INVALIDATION_URL);
    }, []);

    const getAccessToken = useCallback(() => user?.access_token, [user]);

    const value = useMemo<AuthContextValue>(
        () => ({
            state,
            username: user?.profile.preferred_username,
            roles: (user?.profile.roles as string[] | undefined) ?? [],
            login,
            logout,
            signOutEverywhere,
            getAccessToken
        }),
        [state, user, login, logout, signOutEverywhere, getAccessToken]
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
