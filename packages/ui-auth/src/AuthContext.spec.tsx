import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'oidc-client-ts';
import { AuthProvider, useAuth } from './AuthContext.js';
import type { AuthClient } from './createAuthClient.js';

const IN_30_MINUTES = () => Math.floor(Date.now() / 1000) + 30 * 60;

const user = {
    access_token: 'token-abc',
    expires_at: IN_30_MINUTES(),
    profile: { preferred_username: 'radoslav', roles: ['qr-manager.admin'] }
} as unknown as User;

/** A signed-in user whose token expires when told to. */
const liveUser = (overrides: Partial<Record<string, unknown>> = {}): User =>
    ({ ...user, expires_at: IN_30_MINUTES(), expired: false, ...overrides }) as unknown as User;

const fakeClient = (overrides: Partial<Record<string, unknown>> = {}): AuthClient =>
    ({
        getUser: vi.fn().mockResolvedValue(null),
        signinRedirect: vi.fn().mockResolvedValue(undefined),
        signoutRedirect: vi.fn().mockResolvedValue(undefined),
        events: { addUserLoaded: vi.fn(), removeUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), removeUserUnloaded: vi.fn() },
        ...overrides
    } as unknown as AuthClient);

const Probe = () => {
    const { state, username, login, logout } = useAuth();
    return (
        <div>
            <span data-testid="state">{state}</span>
            <span data-testid="username">{username ?? '-'}</span>
            <button onClick={() => void login()}>login</button>
            <button onClick={() => void logout()}>logout</button>
        </div>
    );
};

afterEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
});

describe('AuthProvider', () => {
    it('probes the IdP for an existing SSO session on mount, top-level and with prompt=none', async () => {
        // This is the SSO case: signed in at another app, this redirect comes
        // back with a code and no login form is ever shown. It must NOT be an
        // iframe — Authentik sets X-Frame-Options: DENY.
        const client = fakeClient();
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        await waitFor(() => expect(client.signinRedirect).toHaveBeenCalledOnce());
        expect(client.signinRedirect).toHaveBeenCalledWith(
            expect.objectContaining({ prompt: 'none' })
        );
        // The page is navigating away; it must not flash the anonymous shell.
        expect(screen.getByTestId('state')).toHaveTextContent('loading');
    });

    it('does NOT probe while a callback is in flight — this was an infinite loop', async () => {
        // Regression. login() clears the per-tab marker, so on return from the
        // IdP the provider saw no user and no marker and redirected away before
        // CallbackPage could exchange the code. Sign in, bounce, sign in, bounce.
        window.history.replaceState(null, '', '/callback?code=abc&state=xyz');
        const client = fakeClient();
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        await waitFor(() => expect(client.getUser).not.toHaveBeenCalled());
        expect(client.signinRedirect).not.toHaveBeenCalled();
        // Stays loading: the callback owns this page load, and the userLoaded
        // event is what will settle it.
        expect(screen.getByTestId('state')).toHaveTextContent('loading');
    });

    it('does not probe on an error callback either', async () => {
        window.history.replaceState(null, '', '/callback?error=login_required&state=xyz');
        const client = fakeClient();
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        await waitFor(() => expect(client.signinRedirect).not.toHaveBeenCalled());
    });

    it('probes only once per tab, so an anonymous visitor does not redirect-loop', async () => {
        // Second mount: the IdP already answered login_required for this tab.
        window.sessionStorage.setItem('auth.sso-attempted', '1');
        const client = fakeClient();
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous'));
        expect(client.signinRedirect).not.toHaveBeenCalled();
        expect(screen.getByTestId('username')).toHaveTextContent('-');
    });

    it('adopts a live user from the store without contacting the IdP', async () => {
        const client = fakeClient({ getUser: vi.fn().mockResolvedValue(liveUser()) });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));
        expect(screen.getByTestId('username')).toHaveTextContent('radoslav');
        expect(client.signinRedirect).not.toHaveBeenCalled();
    });

    it('starts a redirect login on demand, WITHOUT prompt=none', async () => {
        // The tab has already had its silent probe answered, so the provider
        // settles on anonymous and shows the sign-in affordance.
        window.sessionStorage.setItem('auth.sso-attempted', '1');
        const client = fakeClient();
        render(<AuthProvider client={client}><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous'));

        await userEvent.click(screen.getByText('login'));

        // An explicit click asks to be shown the login form if one is needed,
        // so prompt=none would defeat the whole point.
        expect(client.signinRedirect).toHaveBeenCalledOnce();
        expect(client.signinRedirect).not.toHaveBeenCalledWith(
            expect.objectContaining({ prompt: 'none' })
        );
    });

    it('logs out through the IdP end-session endpoint, which ends the SSO session', async () => {
        const client = fakeClient({ getUser: vi.fn().mockResolvedValue(liveUser()) });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));

        await userEvent.click(screen.getByText('logout'));

        expect(client.signoutRedirect).toHaveBeenCalledOnce();
    });

    it('exposes the access token without ever storing it', async () => {
        const client = fakeClient({ getUser: vi.fn().mockResolvedValue(liveUser()) });
        let token: string | undefined;
        const Reader = () => {
            token = useAuth().getAccessToken();
            return null;
        };
        render(<AuthProvider client={client}><Reader /></AuthProvider>);

        await waitFor(() => expect(token).toBe('token-abc'));
        expect(window.localStorage.getItem('token-abc')).toBeNull();
    });

    it('settles as anonymous when the callback reports no session', async () => {
        // Regression: the provider skips its probe on the callback and waits for
        // userLoaded. On a no-session callback that event never comes, so without
        // this the app sat on Loading… forever instead of showing the sign-in page.
        window.sessionStorage.setItem('auth.sso-attempted', '1');
        const client = fakeClient();
        const Settler = () => {
            const { state, resolveAnonymous } = useAuth();
            return <><span data-testid="state">{state}</span><button onClick={resolveAnonymous}>settle</button></>;
        };
        render(<AuthProvider client={client}><Settler /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous'));

        await userEvent.click(screen.getByText('settle'));
        expect(screen.getByTestId('state')).toHaveTextContent('anonymous');
    });

    it('throws when used outside the provider', () => {
        const Outside = () => {
            useAuth();
            return null;
        };
        expect(() => render(<Outside />)).toThrow(/AuthProvider/);
    });
});

describe('AuthProvider — token renewal', () => {
    const renderSignedIn = async (user: User) => {
        const client = fakeClient({ getUser: vi.fn().mockResolvedValue(user) });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));
        return client;
    };

    it('renews before the token expires, as a top-level prompt=none redirect', async () => {
        // NOT an iframe, and not `automaticSilentRenew`: Authentik sends
        // X-Frame-Options: DENY, so the library's own renewal cannot run here.
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const client = await renderSignedIn(liveUser());

            expect(client.signinRedirect).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

            expect(client.signinRedirect).toHaveBeenCalledWith(
                expect.objectContaining({ prompt: 'none' })
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('renews a minute early, so a request in flight cannot outlive its token', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const client = await renderSignedIn(liveUser());

            // One second before the skew window opens: still nothing.
            await vi.advanceTimersByTimeAsync(29 * 60 * 1000 - 1_000);
            expect(client.signinRedirect).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(2_000);
            expect(client.signinRedirect).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('carries where the user was, so a renewal does not drop them on the landing page', async () => {
        window.history.replaceState(null, '', '/admin/671b?active=true');
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const client = await renderSignedIn(liveUser());
            await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

            expect(client.signinRedirect).toHaveBeenCalledWith(
                expect.objectContaining({ state: { returnTo: '/admin/671b?active=true' } })
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('renews at once when the tab wakes up past the expiry', async () => {
        const client = await renderSignedIn(liveUser({ expires_at: Math.floor(Date.now() / 1000) - 60 }));

        await waitFor(() => expect(client.signinRedirect).toHaveBeenCalledOnce());
    });

    it('gives up rather than looping when renewal keeps returning a dead token', async () => {
        // Clock skew: the browser far enough ahead of the IdP that every fresh
        // token looks expired on arrival. Without a ceiling this is a redirect
        // loop that hammers the IdP and never renders.
        window.sessionStorage.setItem('auth.renew-attempts', '2');
        const client = await renderSignedIn(liveUser({ expires_at: Math.floor(Date.now() / 1000) - 60 }));

        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous'));
        expect(client.signinRedirect).not.toHaveBeenCalled();
        // The counter is cleared, so a later genuine sign-in is not pre-poisoned.
        expect(window.sessionStorage.getItem('auth.renew-attempts')).toBeNull();
    });

    it('clears the futile-renewal count once a healthy token arrives', async () => {
        window.sessionStorage.setItem('auth.renew-attempts', '1');

        await renderSignedIn(liveUser());

        expect(window.sessionStorage.getItem('auth.renew-attempts')).toBeNull();
    });

    it('does not renew a token with no expiry information at all', async () => {
        // A missing field must not become a redirect loop.
        const client = await renderSignedIn(liveUser({ expires_at: undefined }));

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(client.signinRedirect).not.toHaveBeenCalled();
    });

    it('never renews while a callback is being exchanged', async () => {
        // The callback page owns that page load; redirecting from under it
        // discards the code it is about to trade. Reached the only way it can
        // be: the provider does not probe on a callback, so the user arrives
        // through the userLoaded event while the code is still in the URL.
        window.history.replaceState(null, '', '/callback?code=abc&state=xyz');
        let onLoaded: ((next: User) => void) | undefined;
        const client = fakeClient({
            events: {
                addUserLoaded: vi.fn((handler: (next: User) => void) => {
                    onLoaded = handler; 
                }),
                removeUserLoaded: vi.fn(),
                addUserUnloaded: vi.fn(),
                removeUserUnloaded: vi.fn()
            }
        });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        // A token already inside the skew window — the case that would redirect.
        act(() => onLoaded?.(liveUser({ expires_at: Math.floor(Date.now() / 1000) - 60 })));
        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(client.signinRedirect).not.toHaveBeenCalled();
    });
});

describe('AuthProvider — getAccessToken', () => {
    const readToken = async (user: User) => {
        let token: string | undefined;
        const Reader = () => {
            token = useAuth().getAccessToken();
            return <span data-testid="ready">{String(token)}</span>;
        };
        const client = fakeClient({ getUser: vi.fn().mockResolvedValue(user) });
        render(<AuthProvider client={client}><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('ready')).not.toHaveTextContent('undefined'));
        return () => token;
    };

    it('withholds an expired token rather than attaching one the IdP will refuse', async () => {
        // Sending it produces the same 401, but dishonestly: it looks like a
        // permissions bug rather than a session that ended.
        let token: string | undefined = 'unset';
        const Reader = () => {
            token = useAuth().getAccessToken();
            return null;
        };
        const client = fakeClient({
            getUser: vi.fn().mockResolvedValue(liveUser({ expired: true, expires_at: undefined }))
        });
        render(<AuthProvider client={client}><Reader /></AuthProvider>);

        await waitFor(() => expect(token).toBeUndefined());
    });

    it('still hands out a live token', async () => {
        const read = await readToken(liveUser());

        expect(read()).toBe('token-abc');
    });
});
