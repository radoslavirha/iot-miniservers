import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from 'oidc-client-ts';
import type { AuthClient } from './createAuthClient.js';

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

        // A reload empties the in-memory store, so the session is recovered
        // rather than persisted: prompt=none against the IdP's own cookie.
        // Every failure is the same answer — not signed in. That deliberately
        // includes the timeout, which is what a "Permission denied" HTML page
        // inside the renew iframe looks like from here.
        void client
            .getUser()
            .then(existing => (existing && !existing.expired ? existing : client.signinSilent()))
            .then(adopt)
            .catch(() => adopt(null));

        const onLoaded = (next: User) => adopt(next);
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
        await client.signinRedirect();
    }, [client]);

    const logout = useCallback(async () => {
        await client.signoutRedirect();
    }, [client]);

    const signOutEverywhere = useCallback(() => {
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
