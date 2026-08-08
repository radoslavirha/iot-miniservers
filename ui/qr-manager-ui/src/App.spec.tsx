import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App.js';
import type { QrCode } from './api/types.js';
import type { RuntimeConfig } from './runtime/RuntimeConfig.js';

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
