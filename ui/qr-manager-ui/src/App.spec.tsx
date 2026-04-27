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
    imageURL: 'https://api.server.home/qr/qr-codes/id1/image',
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
});
