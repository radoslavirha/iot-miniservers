import AxiosMockAdapter from 'axios-mock-adapter';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { AuthStrategy } from '@radoslavirha/http-provider';
import { HttpProviderService } from './HttpProviderService.js';

const MockAdapter = AxiosMockAdapter as unknown as new (
    instance: AxiosInstance,
    options?: Record<string, unknown>
) => AxiosMockAdapter;

enum ApiKey {
    Example = 'example'
}

/** Shape of a Ts.ED exception as these tests assert on it. */
interface CapturedError {
    status: number;
    message: string;
}

async function captureError(promise: Promise<unknown>): Promise<CapturedError> {
    let captured: unknown;

    try {
        await promise;
    } catch (error) {
        captured = error;
    }

    if (captured === undefined) {
        throw new Error('Expected the request to reject, but it resolved.');
    }

    return captured as CapturedError;
}

describe('HttpProviderService', () => {
    it('is constructible with no arguments so Ts.ED can register the token', () => {
        expect(() => new HttpProviderService()).not.toThrow();
    });

    it('throws for a key that is not configured', () => {
        const service = new HttpProviderService<ApiKey>({});

        expect(() => service.get(ApiKey.Example)).toThrow(/not configured/);
    });

    it('returns a working client for a configured key', async () => {
        const service = new HttpProviderService<ApiKey>({
            [ApiKey.Example]: { baseURL: 'http://example.test' }
        });
        const client = service.get(ApiKey.Example);
        const mock = new MockAdapter(client.raw as AxiosInstance);
        mock.onGet('/ping').reply(200, { pong: true });

        await expect(client.get('/ping')).resolves.toEqual({ pong: true });
        mock.restore();
    });

    it('caches the client per key', () => {
        const service = new HttpProviderService<ApiKey>({
            [ApiKey.Example]: { baseURL: 'http://example.test' }
        });

        expect(service.get(ApiKey.Example)).toBe(service.get(ApiKey.Example));
    });

    it('logs through the injected Logger without it being passed in', async () => {
        const info = vi.fn();
        const service = new HttpProviderService<ApiKey>({
            [ApiKey.Example]: { baseURL: 'http://example.test' }
        });
        // `@Inject(Logger)` installs a getter that resolves from the container,
        // so stub it the same way rather than assigning.
        Object.defineProperty(service, 'logger', {
            get: () => ({ child: () => ({ info, error: vi.fn() }) })
        });

        const client = service.get(ApiKey.Example);
        const mock = new MockAdapter(client.raw as AxiosInstance);
        mock.onGet('/ping').reply(200, { pong: true });

        await client.get('/ping');

        expect(info).toHaveBeenCalledWith('Upstream HTTP request completed', expect.objectContaining({
            provider: ApiKey.Example,
            status: 200
        }));
        mock.restore();
    });

    describe('composed interceptor chain', () => {
        it('translates a persistent failure into a Ts.ED exception', async () => {
            expect.assertions(2);
            const service = new HttpProviderService<ApiKey>({
                [ApiKey.Example]: { baseURL: 'http://example.test' }
            });
            const client = service.get(ApiKey.Example);
            const mock = new MockAdapter(client.raw as AxiosInstance);
            mock.onGet('/boom').reply(503);

            const error = await captureError(client.get('/boom'));

            expect(error.status).toBe(502);
            expect(error.message).toContain(ApiKey.Example);
            mock.restore();
        });

        it('leaves the 401 auth retry working underneath the translation', async () => {
            expect.assertions(2);
            const service = new HttpProviderService<ApiKey>({
                [ApiKey.Example]: {
                    baseURL: 'http://example.test',
                    auth: {
                        strategy: AuthStrategy.None,
                        transport: { headers: [{ name: 'X-Api-Key', value: 'static' }] }
                    }
                }
            });
            const client = service.get(ApiKey.Example);
            const mock = new MockAdapter(client.raw as AxiosInstance);
            mock.onGet('/data').replyOnce(401).onGet('/data').replyOnce(200, { ok: true });

            // Translation is registered after the auth handler, so the 401 still
            // reaches the retry rather than being converted first.
            await expect(client.get('/data')).resolves.toEqual({ ok: true });
            expect(mock.history['get']).toHaveLength(2);
            mock.restore();
        });

        it('attaches translation once even across repeated get() calls', async () => {
            expect.assertions(1);
            const service = new HttpProviderService<ApiKey>({
                [ApiKey.Example]: { baseURL: 'http://example.test' }
            });
            service.get(ApiKey.Example);
            const client = service.get(ApiKey.Example);
            const mock = new MockAdapter(client.raw as AxiosInstance);
            mock.onGet('/boom').reply(500);

            const error = await captureError(client.get('/boom'));

            // A second attachment would wrap the already-translated exception.
            expect(error.status).toBe(502);
            mock.restore();
        });
    });
});
