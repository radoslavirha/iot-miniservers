import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadRuntimeConfig } from './loadRuntimeConfig.js';
import { RuntimeConfigError } from './errors.js';
import { absolutePath, httpUrl } from './schema-helpers.js';

const schema = z.object({
    apiBaseURL: httpUrl(),
    basePath: absolutePath().default('/')
});

const mockFetch = (impl: () => Promise<Response> | Response) => {
    vi.stubGlobal('fetch', vi.fn(impl));
};

const jsonResponse = (body: unknown, status = 200): Response =>
    ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

afterEach(() => {
    vi.unstubAllGlobals();
    document.head.querySelector('base')?.remove();
});

describe('loadRuntimeConfig', () => {
    it('returns the parsed config', async () => {
        mockFetch(() => jsonResponse({ apiBaseURL: 'https://api.test/iot' }));

        await expect(loadRuntimeConfig({ schema, url: '/config.json' }))
            .resolves.toEqual({ apiBaseURL: 'https://api.test/iot', basePath: '/' });
    });

    it('resolves the URL against <base href> when present', async () => {
        const base = document.createElement('base');
        base.href = 'http://localhost/qr-manager/';
        document.head.append(base);
        mockFetch(() => jsonResponse({ apiBaseURL: 'https://api.test' }));

        await loadRuntimeConfig({ schema });

        expect(fetch).toHaveBeenCalledWith('http://localhost/qr-manager/config.json', { cache: 'no-store' });
    });

    it('falls back to the origin root when there is no <base>', async () => {
        mockFetch(() => jsonResponse({ apiBaseURL: 'https://api.test' }));

        await loadRuntimeConfig({ schema });

        expect(fetch).toHaveBeenCalledWith(`${window.location.origin}/config.json`, { cache: 'no-store' });
    });

    it('reports not-found for a non-2xx response', async () => {
        mockFetch(() => jsonResponse({}, 404));

        await expect(loadRuntimeConfig({ schema, url: '/config.json' }))
            .rejects.toMatchObject({ reason: 'not-found' });
    });

    it('reports not-json when the body is HTML (SPA fallback)', async () => {
        mockFetch(() => ({
            ok: true,
            status: 200,
            json: () => Promise.reject(new Error('Unexpected token <'))
        }) as Response);

        const error = await loadRuntimeConfig({ schema, url: '/config.json' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(RuntimeConfigError);
        expect((error as RuntimeConfigError).reason).toBe('not-json');
        expect((error as RuntimeConfigError).message).toContain('SPA fallback');
    });

    it('reports network when the request never completes', async () => {
        mockFetch(() => Promise.reject(new Error('connection refused')));

        await expect(loadRuntimeConfig({ schema, url: '/config.json' }))
            .rejects.toMatchObject({ reason: 'network' });
    });

    it('reports invalid, naming the offending path, when the schema rejects', async () => {
        mockFetch(() => jsonResponse({ apiBaseURL: 'localhost:4002' }));

        const error = await loadRuntimeConfig({ schema, url: '/config.json' }).catch((e: unknown) => e);

        expect((error as RuntimeConfigError).reason).toBe('invalid');
        expect((error as RuntimeConfigError).message).toContain('apiBaseURL');
    });

    it('rejects a scheme-less URL — plain z.url() would accept it', async () => {
        mockFetch(() => jsonResponse({ apiBaseURL: 'localhost:4002' }));

        await expect(loadRuntimeConfig({ schema, url: '/config.json' }))
            .rejects.toMatchObject({ reason: 'invalid' });
    });

    it('rejects an empty required value — the empty-Jinja2-substitution case', async () => {
        mockFetch(() => jsonResponse({ apiBaseURL: '' }));

        await expect(loadRuntimeConfig({ schema, url: '/config.json' }))
            .rejects.toMatchObject({ reason: 'invalid' });
    });
});
