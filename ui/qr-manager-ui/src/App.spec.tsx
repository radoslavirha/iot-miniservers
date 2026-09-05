import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { App } from './App.js';
import type { QrCode } from './api/types.js';
import type { RuntimeConfig } from './runtime/RuntimeConfig.js';

/**
 * AuthProvider calls the IdP on mount. Left real, every test in this file would
 * make a network attempt and pass only through the catch path, several seconds
 * later. The identity control is what is under test here, so the hook is what
 * gets faked.
 */
const { useAuth } = vi.hoisted(() => ({
    useAuth: vi.fn(() => ({
        state: 'anonymous',
        roles: [],
        login: vi.fn(),
        logout: vi.fn(),
        signOutEverywhere: vi.fn(),
        getAccessToken: () => undefined
    }))
}));
vi.mock('@radoslavirha/ui-auth', async importOriginal => ({
    ...(await importOriginal<typeof import('@radoslavirha/ui-auth')>()),
    useAuth,
    AuthProvider: ({ children }: { children: ReactNode }) => children
}));

const auth = {
    issuer: 'https://auth.irha.cz/application/o/qr-manager-server1-sandbox/',
    clientId: 'qr-manager-server1-sandbox',
    scope: 'openid profile email roles',
    redirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/callback',
    postLogoutRedirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/'
};

const sample: QrCode = {
    id: 'id1',
    slug: 'x7k2',
    targetURL: 'https://iot-ui.home/devices/shelf-1',
    label: 'Shelf 1',
    type: 'iot-device',
    active: true,
    qrURL: 'https://qr.home/x7k2',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z'
};

const config = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
    apiBaseURL: 'https://api.server.home/qr',
    basePath: '/',
    auth,
    ...overrides
});

afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
});

describe('<App />', () => {
    it('renders the list page and shows fetched QR codes', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [sample] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }));
        Object.assign(globalThis, { fetch: fetchMock });

        window.history.replaceState(null, '', '/admin');
        render(<App config={config()} />);

        await waitFor(() => expect(screen.getByText('Shelf 1')).toBeInTheDocument());
        expect(fetchMock).toHaveBeenCalledWith('https://api.server.home/qr/qr-codes');
        expect(screen.getByRole('link', { name: 'List' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'New' })).toBeInTheDocument();
    });

    it('redirects "/" to "/admin"', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }));
        Object.assign(globalThis, { fetch: fetchMock });

        render(<App config={config()} />);
        await waitFor(() => expect(screen.getByRole('heading', { name: 'QR codes' })).toBeInTheDocument());
        expect(window.location.pathname).toBe('/admin');
    });

    it('honours basePath for BrowserRouter when sub-path mounted', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }));
        Object.assign(globalThis, { fetch: fetchMock });

        window.history.replaceState(null, '', '/qr-manager/admin');
        render(<App config={config({ basePath: '/qr-manager' })} />);
        await waitFor(() => expect(screen.getByRole('heading', { name: 'QR codes' })).toBeInTheDocument());
    });

    it('shows the banner when the API cannot be reached', async () => {
        Object.assign(globalThis, { fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });

        window.history.replaceState(null, '', '/admin');
        render(<App config={config()} />);

        await waitFor(() => expect(screen.getByText('Cannot reach QR Manager API.')).toBeInTheDocument());
    });

    it('shows the banner when the API returns a server error', async () => {
        Object.assign(globalThis, { fetch: vi.fn().mockResolvedValue(new Response('boom', { status: 503 })) });

        window.history.replaceState(null, '', '/admin');
        render(<App config={config()} />);

        await waitFor(() =>
            expect(screen.getByText(/QR Manager API is having problems/)).toBeInTheDocument());
    });

    it('shows no banner for a 4xx — the API answered, the request was wrong', async () => {
        Object.assign(globalThis, {
            fetch: vi.fn().mockResolvedValue(new Response('bad filter', { status: 422 }))
        });

        window.history.replaceState(null, '', '/admin');
        render(<App config={config()} />);

        // The page still renders its own error; only the global banner stays away.
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        expect(screen.queryByText(/Cannot reach|having problems/)).not.toBeInTheDocument();
    });
});

describe('identity in the header', () => {
    it('offers a log-in button when nobody is signed in', async () => {
        Object.assign(globalThis, {
            fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }))
        });

        window.history.replaceState(null, '', '/admin');
        render(<App config={config()} />);

        expect(await screen.findByRole('button', { name: /log in/i })).toBeInTheDocument();
    });

    it('shows the username, log out and sign out everywhere once signed in', async () => {
        useAuth.mockReturnValue({
            state: 'authenticated',
            username: 'radoslav',
            roles: ['qr-manager.admin'],
            login: vi.fn(),
            logout: vi.fn(),
            signOutEverywhere: vi.fn(),
            getAccessToken: () => 'token-abc'
        } as unknown as ReturnType<typeof useAuth>);
        Object.assign(globalThis, {
            fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }))
        });

        window.history.replaceState(null, '', '/admin');
        render(<App config={config()} />);

        expect(await screen.findByText('radoslav')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign out everywhere/i })).toBeInTheDocument();
    });
});
