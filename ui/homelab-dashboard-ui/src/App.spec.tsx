import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { AppConfigSchema } from './runtime/RuntimeConfig.js';

// Built through the real schema so fixtures cannot drift from what the app
// will actually be handed at runtime.
const config = AppConfigSchema.parse({
    title: 'test-lab',
    unifi: { host: 'https://192.168.1.1', apiKey: 'test-key', site: 'default' },
    serverPattern: '^server(\\d+)\\.home$',
    scheme: 'http'
});

const dnsRecords = [
    { key: 'server1.home', value: '192.168.1.10', record_type: 'A', enabled: true },
    { key: 'app1.home', value: '192.168.1.10', record_type: 'A', enabled: true },
    { key: 'traefik.home', value: '192.168.1.10', record_type: 'A', enabled: true }
];

function mockFetch(records = dnsRecords) {
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(records), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })
    );
    Object.assign(globalThis, { fetch: fetchMock });
    return fetchMock;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('<App />', () => {
    it('renders header with correct title', async () => {
        mockFetch();
        render(<App config={config} />);
        expect(screen.getByText('test-lab')).toBeInTheDocument();
    });

    it('shows loading status while fetching', () => {
        const fetchMock = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
        Object.assign(globalThis, { fetch: fetchMock });

        render(<App config={config} />);
        expect(screen.getByText(/Fetching DNS records/i)).toBeInTheDocument();
    });

    it('renders cluster sections after successful fetch', async () => {
        mockFetch();
        render(<App config={config} />);

        await waitFor(() => expect(screen.getByText(/server1/)).toBeInTheDocument());
        expect(screen.getByText('app1')).toBeInTheDocument();
        expect(screen.getByText('traefik')).toBeInTheDocument();
    });

    it('shows error status when fetch fails', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
        Object.assign(globalThis, { fetch: fetchMock });

        render(<App config={config} />);
        await waitFor(() => expect(screen.getByText(/API key rejected/i)).toBeInTheDocument());
    });

    it('filters services by search query', async () => {
        mockFetch();
        render(<App config={config} />);

        await waitFor(() => expect(screen.getByText('app1')).toBeInTheDocument());

        const search = screen.getByPlaceholderText('Filter services…');
        await userEvent.type(search, 'traefik');

        expect(screen.getByText('traefik')).toBeInTheDocument();
        expect(screen.queryByText('app1')).not.toBeInTheDocument();
    });

    it('shows "no matches found" when filter yields no results', async () => {
        mockFetch();
        render(<App config={config} />);

        await waitFor(() => expect(screen.getByText('app1')).toBeInTheDocument());

        const search = screen.getByPlaceholderText('Filter services…');
        await userEvent.type(search, 'xyznonexistent');

        expect(screen.getByText('no matches found')).toBeInTheDocument();
    });

    it('uses default title "Homelab dashboard" when config.title is not set', async () => {
        mockFetch([]);
        const cfgNoTitle = AppConfigSchema.parse({ unifi: config.unifi });
        render(<App config={cfgNoTitle} />);
        await waitFor(() => expect(screen.getByText('Homelab dashboard')).toBeInTheDocument());
    });
});
