import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthCallback, routePathOf } from './AuthCallback.js';
import type { AuthClient } from './createAuthClient.js';

const { handleCallback, resolveAnonymous } = vi.hoisted(() => ({
    handleCallback: vi.fn(),
    resolveAnonymous: vi.fn()
}));
vi.mock('./handleCallback.js', () => ({ handleCallback }));
vi.mock('./AuthContext.js', () => ({ useAuth: () => ({ resolveAnonymous }) }));

const client = {} as AuthClient;
const navigate = vi.fn();

const renderAt = (basePath = '/') =>
    render(
        <AuthCallback client={client} navigate={navigate} basePath={basePath} defaultPath="/admin" />
    );

beforeEach(() => {
    navigate.mockClear();
    resolveAnonymous.mockClear();
    handleCallback.mockReset();
});

describe('AuthCallback', () => {
    it('shows a retry when the exchange fails', async () => {
        handleCallback.mockResolvedValue({ result: 'failed' });
        renderAt();

        await waitFor(() => expect(screen.getByText(/could not be completed/i)).toBeInTheDocument());
        expect(navigate).not.toHaveBeenCalled();
    });

    it('tells the provider to settle when there is no session, so it does not hang on Loading', async () => {
        // Without this the provider waits for a userLoaded event that never
        // comes, and the app shows Loading… forever instead of the sign-in page.
        handleCallback.mockResolvedValue({ result: 'no-session' });
        renderAt();

        await waitFor(() => expect(resolveAnonymous).toHaveBeenCalled());
        expect(navigate).toHaveBeenCalledWith('/admin', { replace: true });
    });

    it('renders nothing but a status while the exchange is in flight', () => {
        handleCallback.mockReturnValue(new Promise(() => undefined));
        renderAt();

        expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });

    it('exchanges the code once, because a second attempt returns invalid_grant', async () => {
        // StrictMode double-invokes effects; an authorization code is single-use.
        handleCallback.mockResolvedValue({ result: 'signed-in' });
        const { rerender } = renderAt();
        rerender(<AuthCallback client={client} navigate={navigate} defaultPath="/admin" />);

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(handleCallback).toHaveBeenCalledOnce();
    });

    it('lets an app supply its own copy', async () => {
        handleCallback.mockResolvedValue({ result: 'failed' });
        render(
            <AuthCallback
                client={client}
                navigate={navigate}
                defaultPath="/"
                pending={<p>Hold on</p>}
                failed={<p>Nope</p>}
            />
        );

        await waitFor(() => expect(screen.getByText('Nope')).toBeInTheDocument());
    });
});

describe('AuthCallback — where it lands', () => {
    it('returns the user to where they were, so a renewal does not lose their place', async () => {
        handleCallback.mockResolvedValue({ result: 'signed-in', returnTo: '/admin/671b?active=true' });
        renderAt();

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/671b?active=true', { replace: true }));
    });

    it('falls back to the app default when the IdP returned no path', async () => {
        handleCallback.mockResolvedValue({ result: 'signed-in' });
        renderAt();

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin', { replace: true }));
    });

    it('strips the basename, which the router prepends again', async () => {
        handleCallback.mockResolvedValue({ result: 'signed-in', returnTo: '/qr-manager/admin/671b' });
        renderAt('/qr-manager');

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/671b', { replace: true }));
    });
});

describe('routePathOf', () => {
    it('leaves a path alone when the app is mounted at the root', () => {
        expect(routePathOf('/admin/671b', '/')).toBe('/admin/671b');
    });

    it('removes a sub-path basename, with or without its trailing slash', () => {
        // Handing `navigate` the raw pathname of an app mounted at /qr-manager
        // produces /qr-manager/qr-manager/admin — a 404 on every renewal.
        expect(routePathOf('/qr-manager/admin', '/qr-manager')).toBe('/admin');
        expect(routePathOf('/qr-manager/admin', '/qr-manager/')).toBe('/admin');
    });

    it('yields a rooted path when stripping consumed the whole value', () => {
        expect(routePathOf('/qr-manager', '/qr-manager')).toBe('/');
    });

    it('refuses the callback route itself, which would loop', () => {
        expect(routePathOf('/callback?code=abc', '/')).toBeUndefined();
        expect(routePathOf('/qr-manager/callback', '/qr-manager')).toBeUndefined();
    });

    it('passes undefined through, so the caller applies its own default', () => {
        expect(routePathOf(undefined, '/')).toBeUndefined();
    });
});
