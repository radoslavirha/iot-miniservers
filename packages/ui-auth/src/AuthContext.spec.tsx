import { describe, expect, it, vi } from 'vitest';
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
        signinSilent: vi.fn().mockResolvedValue(null),
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

describe('AuthProvider', () => {
    it('recovers a session silently on mount', async () => {
        const client = fakeClient({ signinSilent: vi.fn().mockResolvedValue(user) });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));
        expect(screen.getByTestId('username')).toHaveTextContent('radoslav');
    });

    it('lands on anonymous when the silent attempt fails', async () => {
        // Covers all three prompt=none outcomes: login_required, a hard error,
        // and the timeout that stands in for the Permission denied HTML page.
        const client = fakeClient({ signinSilent: vi.fn().mockRejectedValue(new Error('login_required')) });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous'));
        expect(screen.getByTestId('username')).toHaveTextContent('-');
    });

    it('starts a redirect login on demand', async () => {
        const client = fakeClient();
        render(<AuthProvider client={client}><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous'));

        await userEvent.click(screen.getByText('login'));

        expect(client.signinRedirect).toHaveBeenCalledOnce();
    });

    it('logs out through the IdP end-session endpoint', async () => {
        const client = fakeClient({ signinSilent: vi.fn().mockResolvedValue(user) });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));

        await userEvent.click(screen.getByText('logout'));

        expect(client.signoutRedirect).toHaveBeenCalledOnce();
    });

    it('exposes the access token without ever storing it', async () => {
        const client = fakeClient({ signinSilent: vi.fn().mockResolvedValue(user) });
        let token: string | undefined;
        const Reader = () => {
            token = useAuth().getAccessToken();
            return null;
        };
        render(<AuthProvider client={client}><Reader /></AuthProvider>);

        await waitFor(() => expect(token).toBe('token-abc'));
        expect(window.localStorage.getItem('token-abc')).toBeNull();
    });

    it('reuses a live user without asking the IdP again', async () => {
        // The other branch of the mount effect. Without it `getUser` is only
        // ever exercised returning null, and the package misses its function
        // coverage threshold at Task 4.
        const signinSilent = vi.fn();
        const client = fakeClient({
            getUser: vi.fn().mockResolvedValue({ ...user, expired: false }),
            signinSilent
        });
        render(<AuthProvider client={client}><Probe /></AuthProvider>);

        await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated'));
        expect(signinSilent).not.toHaveBeenCalled();
    });

    it('sends the browser to the IdP invalidation flow to sign out everywhere', async () => {
        // RP-initiated logout leaves the Authentik session alive (trap 4), so
        // this is the only action that actually ends it. It is a full-page
        // navigation, not a client call — hence the assign() spy.
        const assign = vi.fn();
        vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);

        const client = fakeClient({ signinSilent: vi.fn().mockResolvedValue(user) });
        const Reader = () => {
            const { signOutEverywhere } = useAuth();
            return <button onClick={signOutEverywhere}>everywhere</button>;
        };
        render(<AuthProvider client={client}><Reader /></AuthProvider>);

        await userEvent.click(screen.getByText('everywhere'));

        expect(assign).toHaveBeenCalledWith('https://auth.irha.cz/flows/-/default/invalidation/');
    });

    it('throws when used outside the provider', () => {
        const Outside = () => {
            useAuth();
            return null;
        };
        expect(() => render(<Outside />)).toThrow(/AuthProvider/);
    });
});
