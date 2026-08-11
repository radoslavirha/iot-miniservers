import { type AxiosAdapter, type AxiosInstance } from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitState, isTaskCancelledError } from '@radoslavirha/resilience';
import { AuthStrategy } from './schemas/auth.schema.js';
import { createProvidersSchema } from './schemas/providers.schema.js';
import { HttpProviderFactory } from './HttpProviderFactory.js';

vi.mock('node:fs/promises');

// AxiosMockAdapter types differ between CJS and ESM axios resolution — cast needed
 
const MockAdapter = AxiosMockAdapter as unknown as new (instance: AxiosInstance, options?: Record<string, unknown>) => AxiosMockAdapter;

/**
 * The transport behind a client. Tests mock at this level; application code
 * should never need it.
 */
const transport = (client: { raw: unknown }): AxiosInstance => client.raw as AxiosInstance;

describe('HttpProviderFactory', () => {
    it('throws when key is not configured', () => {
        const factory = new HttpProviderFactory<'unknown'>({});
        expect(() => factory.get('unknown')).toThrow('HTTP provider "unknown" is not configured');
    });

    it('returns an AxiosInstance', () => {
        const factory = new HttpProviderFactory({
            'test-api': { baseURL: 'http://localhost:4000' }
        });
        const instance = factory.get('test-api');
        expect(typeof instance.get).toBe('function');
        expect(typeof instance.post).toBe('function');
    });

    it('caches the same instance on repeated get()', () => {
        const factory = new HttpProviderFactory({
            'test-api': { baseURL: 'http://localhost:4000' }
        });
        const a = factory.get('test-api');
        const b = factory.get('test-api');
        expect(a).toBe(b);
    });

    it('sets baseURL on the axios instance', async () => {
        const factory = new HttpProviderFactory({
            'my-api': { baseURL: 'http://my-api.example.com' }
        });
        const instance = factory.get('my-api');
        expect(instance.baseURL).toBe('http://my-api.example.com');
    });

    describe('breakers()', () => {
        it('is empty before any client is built', () => {
            const factory = new HttpProviderFactory({
                'test-api': { baseURL: 'http://localhost:4000', resilience: { circuitBreaker: {} } }
            });

            expect(factory.breakers().size).toBe(0);
        });

        it('exposes the breaker for a provider configured with one', () => {
            const factory = new HttpProviderFactory({
                'test-api': { baseURL: 'http://localhost:4000', resilience: { circuitBreaker: {} } }
            });

            factory.get('test-api');

            // A breaker that has seen no traffic reports Closed, which is honest: there is
            // no evidence of a fault.
            expect(factory.breakers().get('test-api')?.state).toBe(CircuitState.Closed);
        });

        // A missing key means "no signal", not "healthy" — callers must not conflate them.
        it('records nothing for a provider without a circuit breaker', () => {
            const factory = new HttpProviderFactory({
                'no-breaker': { baseURL: 'http://localhost:4000', resilience: { timeout: { ms: 100 } } },
                'no-resilience': { baseURL: 'http://localhost:4000' }
            });

            factory.get('no-breaker');
            factory.get('no-resilience');

            expect(factory.breakers().size).toBe(0);
        });

        it('keeps the provider breaker distinct from the auth client that shares its key', () => {
            const factory = new HttpProviderFactory({
                'test-api': {
                    baseURL: 'http://localhost:4000',
                    resilience: { circuitBreaker: {} },
                    auth: {
                        strategy: AuthStrategy.TokenExchange,
                        request: { method: 'POST', url: 'https://auth.example.com/token' },
                        tokenExtractor: [{ field: 'access_token', as: 'value' }],
                        transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
                    }
                }
            });

            factory.get('test-api');

            // One entry, not overwritten by the auth client's separate policy.
            expect(factory.breakers().size).toBe(1);
        });
    });

    describe('static transport (no strategy)', () => {
        it('injects static header on every request', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    auth: {
                        transport: {
                            headers: [{ name: 'X-Api-Key', value: 'static-key' }]
                        }
                    }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/test').reply(200, { ok: true });

            await instance.get('/test');
            expect(mock.history['get']?.[0]?.headers?.['X-Api-Key']).toBe('static-key');
            mock.restore();
        });

        it('injects static query param on every request', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    auth: {
                        transport: {
                            queryParams: [{ name: 'apiKey', value: 'abc123' }]
                        }
                    }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/test').reply(200, {});

            await instance.get('/test');
            expect(mock.history['get']?.[0]?.params?.['apiKey']).toBe('abc123');
            mock.restore();
        });
    });

    describe('kubernetes-service-account strategy', () => {
        beforeEach(() => {
            vi.mocked(readFile).mockResolvedValue('k8s-token' as never);
        });

        afterEach(() => {
            vi.resetAllMocks();
        });

        it('injects Bearer token from mocked file read', async () => {
            const factory = new HttpProviderFactory({
                'svc': {
                    baseURL: 'http://svc.local',
                    auth: {
                        strategy: AuthStrategy.KubernetesServiceAccount,
                        tokenPath: '/run/secrets/token',
                        transport: {
                            headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }]
                        }
                    }
                }
            });
            const instance = factory.get('svc');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/health').reply(200, {});

            await instance.get('/health');
            expect(mock.history['get']?.[0]?.headers?.['Authorization']).toBe('Bearer k8s-token');
            mock.restore();
        });
    });

    describe('401 retry behaviour', () => {
        afterEach(() => {
            vi.resetAllMocks();
        });

        it('retries request once after 401, re-acquiring credentials', async () => {
            vi.mocked(readFile)
                .mockResolvedValueOnce('old-token' as never)
                .mockResolvedValueOnce('new-token' as never);

            const factory = new HttpProviderFactory({
                'svc': {
                    baseURL: 'http://svc.local',
                    auth: {
                        strategy: AuthStrategy.KubernetesServiceAccount,
                        tokenPath: '/run/secrets/token',
                        transport: {
                            headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }]
                        }
                    }
                }
            });
            const instance = factory.get('svc');
            const mock = new MockAdapter(transport(instance));
            // First call returns 401, second returns 200
            mock.onGet('/data')
                .replyOnce(401)
                .onGet('/data')
                .replyOnce(200, { data: 'ok' });

            const response = await instance.get('/data');
            expect(response).toEqual({ data: 'ok' });
            // Second request should use new token
            expect(mock.history['get']?.[1]?.headers?.['Authorization']).toBe('Bearer new-token');
            mock.restore();
        });

        it('replays a 401 when resilience timeout is configured', async () => {
            const factory = new HttpProviderFactory({
                'svc': {
                    baseURL: 'http://svc.local',
                    auth: {
                        transport: {
                            headers: [{ name: 'X-Api-Key', value: 'static-key' }]
                        }
                    },
                    resilience: { timeout: { ms: 1000 } }
                }
            });
            const instance = factory.get('svc');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/data').replyOnce(401).onGet('/data').replyOnce(200, { data: 'ok' });

            await expect(instance.get('/data')).resolves.toEqual({ data: 'ok' });
            expect(mock.history['get']).toHaveLength(2);
            mock.restore();
        });

        it('does not retry a second 401 (no infinite loop)', async () => {
            vi.mocked(readFile).mockResolvedValue('token' as never);

            const factory = new HttpProviderFactory({
                'svc': {
                    baseURL: 'http://svc.local',
                    auth: {
                        strategy: AuthStrategy.KubernetesServiceAccount,
                        tokenPath: '/run/secrets/token',
                        transport: {
                            headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }]
                        }
                    }
                }
            });
            const instance = factory.get('svc');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/secure').reply(401);

            await expect(instance.get('/secure')).rejects.toThrow();
            mock.restore();
        });

        it('does not nest the resilience policy when the 401 retry replays the request', async () => {
            vi.mocked(readFile).mockResolvedValue('token' as never);

            const factory = new HttpProviderFactory({
                'svc': {
                    baseURL: 'http://svc.local',
                    auth: {
                        strategy: AuthStrategy.KubernetesServiceAccount,
                        tokenPath: '/run/secrets/token',
                        transport: {
                            headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }]
                        }
                    },
                    resilience: { retry: { count: 2, backoffMs: 0 } }
                }
            });
            const instance = factory.get('svc');

            // A hand-rolled adapter rather than axios-mock-adapter: the real
            // adapter reports the config it was handed (including `adapter`) on
            // the error, which is what lets a replay re-wrap its own wrapper.
            // axios-mock-adapter drops that field and would hide the nesting.
            let calls = 0;
            transport(instance).defaults.adapter = (async (config) => {
                calls++;
                const status = calls === 1 ? 401 : 500;
                throw Object.assign(new Error(`http ${status}`), {
                    isAxiosError: true,
                    config,
                    response: { status, data: {}, headers: {}, config }
                });
            }) as AxiosAdapter;

            await expect(instance.get('/secure')).rejects.toThrow();
            // 1 x 401, then the replay runs 1 initial + 2 retries. Nested
            // policies would square the retry count instead (3 x 3 + 1 = 10).
            expect(calls).toBe(4);
        });
    });

    describe('strategy selection', () => {
        it('creates a TokenExchangeStrategy for token-exchange config', () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    auth: {
                        strategy: AuthStrategy.TokenExchange,
                        request: { method: 'POST', url: 'https://auth.example.com/token' },
                        tokenExtractor: [{ field: 'access_token', as: 'value' }],
                        transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
                    }
                }
            });
            const instance = factory.get('api');
            expect(typeof instance.get).toBe('function');
        });

        it('creates a JwtSelfSignedStrategy for jwt-self-signed config', () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    auth: {
                        strategy: AuthStrategy.JwtSelfSigned,
                        key: { source: 'value', value: 'secret' },
                        algorithm: 'HS256',
                        claims: { exp: 3600 },
                        transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
                    }
                }
            });
            const instance = factory.get('api');
            expect(typeof instance.get).toBe('function');
        });

        it('does not attach interceptor when auth has no transport property', () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    // strategy: None with no transport key at runtime
                    auth: { strategy: AuthStrategy.None } as { strategy: typeof AuthStrategy.None }
                }
            });
            const instance = factory.get('api');
            expect(typeof instance.get).toBe('function');
        });
    });

    describe('status-code retry (via resilience)', () => {
        it('does not retry when resilience is not configured', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com'
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/no-resilience').reply(500);

            await expect(instance.get('/no-resilience')).rejects.toThrow();
            expect(mock.history['get']).toHaveLength(1);
            mock.restore();
        });

        it('does not retry when retry count is 0', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { retry: { count: 0, backoffMs: 0 } }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/retry-disabled').reply(500);

            await expect(instance.get('/retry-disabled')).rejects.toThrow();
            expect(mock.history['get']).toHaveLength(1);
            mock.restore();
        });

        it('retries on a retriable status code then succeeds', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { retry: { count: 1, backoffMs: 0 } }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/retry-test').replyOnce(500).onGet('/retry-test').replyOnce(200, { ok: true });

            const response = await instance.get('/retry-test');
            expect(response).toBeDefined();
            expect(mock.history['get']).toHaveLength(2); // initial + 1 retry
            mock.restore();
        });

        it('does not retry a status code outside the default retriable set', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { retry: { count: 3, backoffMs: 0 } }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/no-retry').reply(404);

            await expect(instance.get('/no-retry')).rejects.toThrow();
            expect(mock.history['get']).toHaveLength(1); // not retried
            mock.restore();
        });

        it('retries a status code added via retriableStatusCodes', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { retry: { count: 1, backoffMs: 0 } },
                    retriableStatusCodes: [429]
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/throttled').replyOnce(429).onGet('/throttled').replyOnce(200, { ok: true });

            const response = await instance.get('/throttled');
            expect(response).toBeDefined();
            expect(mock.history['get']).toHaveLength(2); // initial + 1 retry
            mock.restore();
        });

        it('stops retrying a default status once retriableStatusCodes overrides it', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { retry: { count: 3, backoffMs: 0 } },
                    retriableStatusCodes: [429]
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/server-error').reply(503);

            await expect(instance.get('/server-error')).rejects.toThrow();
            expect(mock.history['get']).toHaveLength(1); // 503 is no longer retriable
            mock.restore();
        });

        it('retries a network error (no response) then succeeds', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { retry: { count: 1, backoffMs: 0 } }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/net').networkErrorOnce().onGet('/net').replyOnce(200, { ok: true });

            const response = await instance.get('/net');
            expect(response).toBeDefined();
            expect(mock.history['get']).toHaveLength(2);
            mock.restore();
        });

        it('does not retry a non-axios error thrown by the adapter', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { retry: { count: 3, backoffMs: 0 } }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/throw').reply(() => {
                throw new Error('not-an-axios-error');
            });

            await expect(instance.get('/throw')).rejects.toThrow('not-an-axios-error');
            expect(mock.history['get']).toHaveLength(1); // shouldHandle returned false → not retried
            mock.restore();
        });
    });

    describe('resilience policy', () => {
        it('times out a hung request and rejects with a cancellation error', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { timeout: { ms: 20 } }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/hang').reply(() => new Promise(() => { /* never resolves */ }));

            await expect(instance.get('/hang')).rejects.toSatisfy(isTaskCancelledError);
            mock.restore();
        });

        it('aborts the request when the caller signal aborts', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { timeout: { ms: 5000 } }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/hang').reply(() => new Promise(() => { /* never resolves */ }));

            const controller = new AbortController();
            const pending = instance.get('/hang', { signal: controller.signal });
            controller.abort();

            await expect(pending).rejects.toBeDefined();
            mock.restore();
        });

        it('still performs normal requests with a resilience policy configured', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { timeout: { ms: 1000 }, circuitBreaker: {} }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/ok').reply(200, { ok: true });

            const response = await instance.get('/ok');
            expect(response).toEqual({ ok: true });
            mock.restore();
        });

        it('honours a per-request adapter override when resilience is enabled', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    resilience: { timeout: { ms: 1000 } }
                }
            });
            const instance = factory.get('api');
            const requestAdapter = vi.fn(async (config: Parameters<AxiosAdapter>[0]) => ({
                config,
                data: { via: 'request-adapter' },
                headers: {},
                status: 200,
                statusText: 'OK'
            }));

            // A per-request adapter is transport-specific, so it is set through
            // the transport rather than the neutral client contract.
            const response = await transport(instance).get('/custom-adapter', {
                adapter: requestAdapter as AxiosAdapter
            });

            expect(response.data).toEqual({ via: 'request-adapter' });
            expect(requestAdapter).toHaveBeenCalledTimes(1);
        });
    });

    describe('onInstanceCreated seam', () => {
        it('runs for the provider client with its key and role', () => {
            const onInstanceCreated = vi.fn();
            const factory = new HttpProviderFactory({
                'api': { baseURL: 'http://api.example.com' }
            }, { onInstanceCreated });

            const instance = factory.get('api');

            expect(onInstanceCreated).toHaveBeenCalledExactlyOnceWith(transport(instance), 'api', 'client');
        });

        it('runs only once per key, matching instance caching', () => {
            const onInstanceCreated = vi.fn();
            const factory = new HttpProviderFactory({
                'api': { baseURL: 'http://api.example.com' }
            }, { onInstanceCreated });

            factory.get('api');
            factory.get('api');

            expect(onInstanceCreated).toHaveBeenCalledOnce();
        });

        it('runs for the token-exchange auth client with the auth role', () => {
            const onInstanceCreated = vi.fn();
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    auth: {
                        strategy: AuthStrategy.TokenExchange,
                        request: { method: 'POST', url: 'https://auth.example.com/token' },
                        tokenExtractor: 'access_token',
                        transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
                    }
                }
            }, { onInstanceCreated });

            factory.get('api');

            const roles = onInstanceCreated.mock.calls.map(([, , role]) => role);
            expect(roles).toEqual(expect.arrayContaining(['client', 'auth']));
        });

        it('registers before the auth interceptor, so it observes a raw 401', async () => {
            const seen: number[] = [];
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    auth: {
                        strategy: AuthStrategy.None,
                        transport: { headers: [{ name: 'X-Api-Key', value: 'static' }] }
                    }
                }
            }, {
                onInstanceCreated: (instance) => {
                    instance.interceptors.response.use(
                        (response) => {
                            seen.push(response.status);
                            return response;
                        },
                        (error) => {
                            seen.push((error as { response?: { status?: number } }).response?.status ?? 0);
                            return Promise.reject(error);
                        }
                    );
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/data').replyOnce(401).onGet('/data').replyOnce(200, { ok: true });

            await expect(instance.get('/data')).resolves.toEqual({ ok: true });

            // The 401 is observed as itself before the auth retry recovers it —
            // this ordering is what lets integrations log the real exchange.
            expect(seen).toEqual([401, 200]);
            mock.restore();
        });
    });

    describe('schema validation integration', () => {
        it('createProvidersSchema validates a correct config', () => {
            enum ExternalApi { QRManager = 'qr-manager' }
            const schema = createProvidersSchema(Object.values(ExternalApi));
            const result = schema.safeParse({
                'qr-manager': { baseURL: 'http://localhost:4002' }
            });
            expect(result.success).toBe(true);
        });

        it('createProvidersSchema keeps resilience undefined when omitted', async () => {
            enum ExternalApi { QRManager = 'qr-manager' }
            const schema = createProvidersSchema(Object.values(ExternalApi));
            const parsed = schema.parse({
                'qr-manager': { baseURL: 'http://api.example.com' }
            });

            const factory = new HttpProviderFactory(parsed);
            const instance = factory.get(ExternalApi.QRManager);
            const mock = new MockAdapter(transport(instance));
            mock.onGet('/no-resilience').reply(500);

            await expect(instance.get('/no-resilience')).rejects.toThrow();
            expect(mock.history['get']).toHaveLength(1);
            mock.restore();
        });

        it('createProvidersSchema applies resilience defaults', () => {
            enum ExternalApi { QRManager = 'qr-manager' }
            const schema = createProvidersSchema(Object.values(ExternalApi));
            const parsed = schema.parse({
                'qr-manager': {
                    baseURL: 'http://localhost:4002',
                    resilience: {
                        retry: {},
                        circuitBreaker: {}
                    }
                }
            });

            expect(parsed['qr-manager'].resilience?.retry).toEqual({ count: 0, backoffMs: 250 });
            expect(parsed['qr-manager'].resilience?.circuitBreaker).toEqual({
                halfOpenAfterMs: 10000,
                threshold: 0.5,
                samplingDurationMs: 10000,
                minimumThroughput: 5
            });
        });
    });
});
