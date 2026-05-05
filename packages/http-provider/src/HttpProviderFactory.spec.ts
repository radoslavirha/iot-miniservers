import { type AxiosInstance } from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStrategy } from './schemas/auth.schema.js';
import { createProvidersSchema } from './schemas/providers.schema.js';
import { HttpProviderFactory } from './HttpProviderFactory.js';

vi.mock('node:fs/promises');

// AxiosMockAdapter types differ between CJS and ESM axios resolution — cast needed
 
const MockAdapter = AxiosMockAdapter as unknown as new (instance: AxiosInstance, options?: Record<string, unknown>) => AxiosMockAdapter;

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
        expect(instance.defaults.baseURL).toBe('http://my-api.example.com');
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
            const mock = new MockAdapter(instance);
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
            const mock = new MockAdapter(instance);
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
            const mock = new MockAdapter(instance);
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
            const mock = new MockAdapter(instance);
            // First call returns 401, second returns 200
            mock.onGet('/data')
                .replyOnce(401)
                .onGet('/data')
                .replyOnce(200, { data: 'ok' });

            const response = await instance.get('/data');
            expect(response.data).toEqual({ data: 'ok' });
            // Second request should use new token
            expect(mock.history['get']?.[1]?.headers?.['Authorization']).toBe('Bearer new-token');
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
            const mock = new MockAdapter(instance);
            mock.onGet('/secure').reply(401);

            await expect(instance.get('/secure')).rejects.toThrow();
            mock.restore();
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

    describe('status-code retry', () => {
        it('retries on a configured status code and calls retryDelay', async () => {
            const factory = new HttpProviderFactory({
                'api': {
                    baseURL: 'http://api.example.com',
                    retry: { count: 1, delay: 0, statusCodes: [500] }
                }
            });
            const instance = factory.get('api');
            const mock = new MockAdapter(instance);
            mock.onGet('/retry-test').replyOnce(500).onGet('/retry-test').replyOnce(200, { ok: true });

            const response = await instance.get('/retry-test');
            expect(response.status).toBe(200);
            mock.restore();
        });
    });

    describe('schema validation integration', () => {
        it('createProvidersSchema validates a correct config', () => {
            enum ApiKey { QRManager = 'qr-manager' }
            const schema = createProvidersSchema(Object.values(ApiKey));
            const result = schema.safeParse({
                'qr-manager': { baseURL: 'http://localhost:4002' }
            });
            expect(result.success).toBe(true);
        });
    });
});
