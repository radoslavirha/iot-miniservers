import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'oidc-client-ts';
import { AuthProvider, useAuth } from './AuthContext.js';
import type { AuthClient } from './createAuthClient.js';

const user = {
    access_token: 'token-abc',
    profile: { preferred_username: 'radoslav', roles: ['qr-manager.admin'] }
} as unknown as User;

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
        const client = fakeClient({ getUser: vi.fn().mockResolvedValue({ ...user, expired: false }) });
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
        const client = fakeClient({ getUser: vi.fn().mockResolvedValue({ ...user, expired: false }) });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));

        await userEvent.click(screen.getByText('logout'));

        expect(client.signoutRedirect).toHaveBeenCalledOnce();
    });

    it('exposes the access token without ever storing it', async () => {
        const client = fakeClient({ getUser: vi.fn().mockResolvedValue({ ...user, expired: false }) });
        let token: string | undefined;
        const Reader = () => {
            token = useAuth().getAccessToken();
            return null;
        };
        render(<AuthProvider client={client}><Reader /></AuthProvider>);

        await waitFor(() => expect(token).toBe('token-abc'));
        expect(window.localStorage.getItem('token-abc')).toBeNull();
    });

    it('throws when used outside the provider', () => {
        const Outside = () => {
            useAuth();
            return null;
        };
        expect(() => render(<Outside />)).toThrow(/AuthProvider/);
    });
});
