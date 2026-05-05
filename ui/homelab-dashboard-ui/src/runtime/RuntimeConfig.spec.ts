import { describe, expect, it, vi, afterEach } from 'vitest';
import { loadRuntimeConfig } from './RuntimeConfig.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('loadRuntimeConfig', () => {
    it('returns parsed config when config.json is valid', async () => {
        const mockConfig = {
            unifi: { host: 'https://192.168.1.1', apiKey: 'test-key' }
        };
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(mockConfig), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );
        Object.assign(globalThis, { fetch: fetchMock });

        const config = await loadRuntimeConfig();
        expect(config.unifi.host).toBe('https://192.168.1.1');
        expect(config.unifi.apiKey).toBe('test-key');
    });

    it('throws when config.json returns non-2xx status', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
        Object.assign(globalThis, { fetch: fetchMock });

        await expect(loadRuntimeConfig()).rejects.toThrow('HTTP 404');
    });

    it('throws when config.json is not valid JSON', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response('not json', {
                status: 200,
                headers: { 'Content-Type': 'text/plain' }
            })
        );
        Object.assign(globalThis, { fetch: fetchMock });

        await expect(loadRuntimeConfig()).rejects.toThrow('not valid JSON');
    });

    it('throws when unifi.host is missing', async () => {
        const mockConfig = { unifi: { apiKey: 'key' } };
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(mockConfig), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );
        Object.assign(globalThis, { fetch: fetchMock });

        await expect(loadRuntimeConfig()).rejects.toThrow('unifi.host is required');
    });

    it('throws when unifi.apiKey is missing', async () => {
        const mockConfig = { unifi: { host: 'https://192.168.1.1' } };
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(mockConfig), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );
        Object.assign(globalThis, { fetch: fetchMock });

        await expect(loadRuntimeConfig()).rejects.toThrow('unifi.apiKey is required');
    });

    it('throws on network error', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));
        Object.assign(globalThis, { fetch: fetchMock });

        await expect(loadRuntimeConfig()).rejects.toThrow('Network error loading config.json: Network failure');
    });
});
