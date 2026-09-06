import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useQrCodesClient } from './useQrCodesClient.js';
import { RuntimeConfigProvider } from '../runtime/RuntimeConfigContext.js';
import { ApiStatusProvider } from '../runtime/ApiStatusContext.js';
import type { RuntimeConfig } from '../runtime/RuntimeConfig.js';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('@radoslavirha/ui-auth', () => ({ useAuth }));

const config: RuntimeConfig = {
    apiBaseURL: 'http://api.test',
    basePath: '/',
    auth: {
        issuer: 'https://auth.irha.cz/application/o/qr-manager-server1-sandbox/',
        clientId: 'qr-manager-server1-sandbox',
        scope: 'openid profile email roles',
        redirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/callback',
        postLogoutRedirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/'
    }
};

const wrapper = ({ children }: { children: ReactNode }) => (
    <RuntimeConfigProvider value={config}>
        <ApiStatusProvider report={vi.fn()}>{children}</ApiStatusProvider>
    </RuntimeConfigProvider>
);

const okJson = (body: unknown): Response => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
});

/** A Response body reads once, so hand out a fresh one per call. */
const mockFetch = () => {
    // Typed as fetch so `mock.calls` keeps the [input, init] tuple shape rather
    // than degrading to any[], which tsc rejects at the call sites below.
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(okJson({ items: [] })));
    Object.assign(globalThis, { fetch: fetchMock });
    return fetchMock;
};

const authHeaderOf = (call: Parameters<typeof fetch>): string | null =>
    new Headers(call[1]?.headers).get('Authorization');

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useQrCodesClient', () => {
    it('sends the signed-in user token on a call', async () => {
        useAuth.mockReturnValue({ getAccessToken: () => 'token-abc' });
        const fetchMock = mockFetch();

        const { result } = renderHook(() => useQrCodesClient(), { wrapper });
        await result.current.list({});

        expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer token-abc');
    });

    it('sends nothing while the token is absent', async () => {
        useAuth.mockReturnValue({ getAccessToken: () => undefined });
        const fetchMock = mockFetch();

        const { result } = renderHook(() => useQrCodesClient(), { wrapper });
        await result.current.list({});

        expect(authHeaderOf(fetchMock.mock.calls[0])).toBeNull();
    });

    it('reads the token per call, so a replaced token is picked up without rebuilding the client', async () => {
        // The client is memoised. One that captured the token at construction
        // would keep sending the old one after the session was recovered.
        let current = 'first';
        useAuth.mockReturnValue({ getAccessToken: () => current });
        const fetchMock = mockFetch();

        const { result } = renderHook(() => useQrCodesClient(), { wrapper });
        await result.current.list({});
        current = 'second';
        await result.current.list({});

        expect(authHeaderOf(fetchMock.mock.calls[1])).toBe('Bearer second');
    });

    it('calls the API the config points at', async () => {
        useAuth.mockReturnValue({ getAccessToken: () => 'token-abc' });
        const fetchMock = mockFetch();

        const { result } = renderHook(() => useQrCodesClient(), { wrapper });
        await result.current.list({});

        expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/qr-codes');
    });
});
