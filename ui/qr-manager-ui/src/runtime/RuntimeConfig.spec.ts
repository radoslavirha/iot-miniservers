import { describe, expect, it, vi, afterEach } from 'vitest';
import { loadRuntimeConfig, validateRuntimeConfig } from './RuntimeConfig.js';

const okJson = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
});

describe('validateRuntimeConfig', () => {
    it('strips trailing slashes from apiBaseURL', () => {
        const config = validateRuntimeConfig({ apiBaseURL: 'https://api.server.home/qr///' });
        expect(config.apiBaseURL).toBe('https://api.server.home/qr');
    });

    it('defaults basePath to "/" when omitted', () => {
        const config = validateRuntimeConfig({ apiBaseURL: 'https://api.server.home/qr' });
        expect(config.basePath).toBe('/');
    });

    it('keeps an explicit basePath', () => {
        const config = validateRuntimeConfig({ apiBaseURL: 'https://api.server.home/qr', basePath: '/qr-manager/' });
        expect(config.basePath).toBe('/qr-manager/');
    });

    it('prepends leading slash to basePath if missing', () => {
        const config = validateRuntimeConfig({ apiBaseURL: 'https://api.server.home/qr', basePath: 'qr-manager' });
        expect(config.basePath).toBe('/qr-manager');
    });

    it('throws when apiBaseURL is missing', () => {
        expect(() => validateRuntimeConfig({})).toThrow(/apiBaseURL/);
    });

    it('throws when apiBaseURL is empty', () => {
        expect(() => validateRuntimeConfig({ apiBaseURL: '' })).toThrow(/apiBaseURL/);
    });

    it('throws when input is not an object', () => {
        expect(() => validateRuntimeConfig(null)).toThrow(/JSON object/);
        expect(() => validateRuntimeConfig('http://x')).toThrow(/JSON object/);
    });
});

describe('loadRuntimeConfig', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fetches /config.json (absolute path) and validates the response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okJson({ apiBaseURL: 'http://localhost:4011/', basePath: '/qr-manager/' }));
        Object.assign(globalThis, { fetch: fetchMock });

        const config = await loadRuntimeConfig();
        expect(fetchMock).toHaveBeenCalledWith('/config.json', { cache: 'no-store' });
        expect(config.apiBaseURL).toBe('http://localhost:4011');
        expect(config.basePath).toBe('/qr-manager/');
    });

    it('throws a helpful error when the response is HTML (SPA fallback)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
        }));
        Object.assign(globalThis, { fetch: fetchMock });

        await expect(loadRuntimeConfig()).rejects.toThrow(/SPA fallback/);
    });

    it('throws when the response status is not ok', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
        Object.assign(globalThis, { fetch: fetchMock });

        await expect(loadRuntimeConfig()).rejects.toThrow(/404/);
    });
});
