import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { describe, expect, it, vi } from 'vitest';
import { AuthStrategy, HttpProviderFactory } from '@radoslavirha/http-provider';
import type { BaseLogger } from '@radoslavirha/tsed-logger';
import { ExternalApiEntrySchema, type ExternalApiEntry } from './externalApi.schema.js';
import { HttpLogConfigSchema } from './logging.schema.js';
import { attachRequestLogging } from './attachRequestLogging.js';

const MockAdapter = AxiosMockAdapter as unknown as new (
    instance: AxiosInstance,
    options?: Record<string, unknown>
) => AxiosMockAdapter;

/**
 * Only `info` and `error` are exercised, so the mock stands in for a real
 * `BaseLogger` rather than implementing its whole surface.
 */
function buildLogger() {
    return {
        info: vi.fn<(body: string, meta?: Record<string, unknown>) => void>(),
        error: vi.fn<(body: string, meta?: Record<string, unknown>) => void>()
    };
}

const asLogger = (logger: TestLogger): BaseLogger => logger as unknown as BaseLogger;

type TestLogger = ReturnType<typeof buildLogger>;

/**
 * Wires logging through the factory's `onInstanceCreated` seam exactly as
 * `HttpProviderService` does, so these tests exercise the real composition
 * rather than the interceptor in isolation.
 */
function buildClient(entry: ExternalApiEntry, logger?: TestLogger): AxiosInstance {
    const factory = new HttpProviderFactory<'api'>({ api: entry }, {
        onInstanceCreated: logger
            ? (instance, key, role) => {
                const { logging } = ExternalApiEntrySchema.parse(entry);
                const name = role === 'auth' ? `${key}:auth` : key;
                attachRequestLogging(instance, asLogger(logger), logging, name);
            }
            : undefined
    });

    return factory.get('api').raw as AxiosInstance;
}

describe('outbound request logging', () => {
    it('logs a completed request with method, url, status and duration', async () => {
        const logger = buildLogger();
        const instance = buildClient({ baseURL: 'http://api.example.com' }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/things').reply(200, { ok: true });

        await instance.get('/things', { params: { page: 2 } });

        expect(logger.info).toHaveBeenCalledOnce();
        const [message, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
        expect(message).toBe('Request completed');
        expect(meta).toMatchObject({ provider: 'api', method: 'GET', url: '/things', status: 200 });
        expect(meta['duration']).toBeTypeOf('number');
        expect(meta['query']).toBe('{"page":2}');
        expect(meta['response']).toBe('{"ok":true}');
        mock.restore();
    });

    it('redacts the authorization header by default', async () => {
        const logger = buildLogger();
        const instance = buildClient({ baseURL: 'http://api.example.com' }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/secure').reply(200, {});

        await instance.get('/secure', { headers: { Authorization: 'Bearer super-secret' } });

        const [, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta['headers']).not.toContain('super-secret');
        expect(meta['headers']).toContain('***');
        mock.restore();
    });

    it('redacts configured request payload paths', async () => {
        const logger = buildLogger();
        const instance = buildClient({
            baseURL: 'http://api.example.com',
            logging: { request: { redactPaths: ['password'] } }
        }, logger);
        const mock = new MockAdapter(instance);
        mock.onPost('/login').reply(200, {});

        await instance.post('/login', { user: 'me', password: 'hunter2' });

        const [, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta['request']).toContain('***');
        expect(meta['request']).not.toContain('hunter2');
        mock.restore();
    });

    it('never dumps a binary response body', async () => {
        const logger = buildLogger();
        const instance = buildClient({ baseURL: 'http://api.example.com' }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/image').reply(200, Buffer.from('binary-payload'), { 'content-type': 'image/png' });

        await instance.get('/image', { responseType: 'arraybuffer' });

        const [, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta['response']).toBe('[[ BINARY ]]');
        mock.restore();
    });

    it('detects a binary body from a capitalised Content-Type header', async () => {
        const logger = buildLogger();
        const instance = buildClient({ baseURL: 'http://api.example.com' }, logger);

        instance.defaults.adapter = (async (config) => ({
            config,
            data: Buffer.from('bytes'),
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/octet-stream' }
        })) as AxiosAdapter;

        await instance.get('/blob');

        const [, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta['response']).toBe('[[ BINARY ]]');
    });

    it('logs a failed request at error level with the status', async () => {
        const logger = buildLogger();
        const instance = buildClient({ baseURL: 'http://api.example.com' }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/boom').reply(500);

        await expect(instance.get('/boom')).rejects.toThrow();

        expect(logger.error).toHaveBeenCalledOnce();
        const [message, meta] = logger.error.mock.calls[0] as [string, Record<string, unknown>];
        expect(message).toBe('Request failed');
        expect(meta).toMatchObject({ provider: 'api', status: 500 });
        expect(meta['error_message']).toBeTypeOf('string');
        mock.restore();
    });

    it('logs a transport-level failure that carries no response', async () => {
        const logger = buildLogger();
        const instance = buildClient({ baseURL: 'http://api.example.com' }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/down').networkError();

        await expect(instance.get('/down')).rejects.toThrow();

        const [, meta] = logger.error.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta['status']).toBeUndefined();
        expect(meta['error_name']).toBeTypeOf('string');
        mock.restore();
    });

    it('still logs when the failure carries neither config nor response', async () => {
        const logger = buildLogger();
        const instance = axios.create();
        attachRequestLogging(instance, asLogger(logger), HttpLogConfigSchema.parse({}), 'api');

        // A throwing auth interceptor rejects before a request config exists, so
        // the error reaching the logger has no `config` and no `response`.
        instance.interceptors.request.use(() => {
            throw Object.assign(new Error('credentials unavailable'), { name: undefined, code: 'ENOCRED' });
        });

        await expect(instance.get('/never-sent')).rejects.toThrow('credentials unavailable');

        const [, meta] = logger.error.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta).toMatchObject({ provider: 'api', method: undefined, status: undefined });
        expect(meta['duration']).toBeUndefined();
        expect(meta['error_name']).toBe('ENOCRED');
    });

    it('omits the stack when stack logging is disabled', async () => {
        const logger = buildLogger();
        const instance = buildClient({
            baseURL: 'http://api.example.com',
            logging: { stack: false }
        }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/boom').reply(500);

        await expect(instance.get('/boom')).rejects.toThrow();

        const [, meta] = logger.error.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta).not.toHaveProperty('error_stack');
        mock.restore();
    });

    it('logs nothing when logging is disabled for the entry', async () => {
        const logger = buildLogger();
        const instance = buildClient({
            baseURL: 'http://api.example.com',
            logging: { enabled: false }
        }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/quiet').reply(200, {});

        await instance.get('/quiet');

        expect(logger.info).not.toHaveBeenCalled();
        mock.restore();
    });

    it('leaves the client working when no logging is wired at all', async () => {
        const instance = buildClient({ baseURL: 'http://api.example.com' });
        const mock = new MockAdapter(instance);
        mock.onGet('/quiet').reply(200, {});

        await expect(instance.get('/quiet')).resolves.toBeDefined();
        mock.restore();
    });

    it('can suppress the headers and response sections', async () => {
        const logger = buildLogger();
        const instance = buildClient({
            baseURL: 'http://api.example.com',
            logging: { headers: { enabled: false }, response: { enabled: false } }
        }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/partial').reply(200, { secret: 'value' });

        await instance.get('/partial');

        const [, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta).not.toHaveProperty('headers');
        expect(meta).not.toHaveProperty('response');
        expect(meta).toHaveProperty('query');
        mock.restore();
    });

    it('can suppress the query and payload sections', async () => {
        const logger = buildLogger();
        const instance = buildClient({
            baseURL: 'http://api.example.com',
            logging: { query: { enabled: false }, request: { enabled: false } }
        }, logger);
        const mock = new MockAdapter(instance);
        mock.onPost('/partial').reply(200, { ok: true });

        await instance.post('/partial', { secret: 'value' }, { params: { token: 'abc' } });

        const [, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
        expect(meta).not.toHaveProperty('query');
        expect(meta).not.toHaveProperty('request');
        expect(meta).toHaveProperty('headers');
        mock.restore();
    });

    it('logs the token-exchange auth call under a dedicated provider key', async () => {
        const logger = buildLogger();
        // The auth client is created by the factory via `axios.create()`, so the
        // global mock must be installed before `get()` for it to be inherited.
        const globalMock = new MockAdapter(axios as unknown as AxiosInstance);
        globalMock.onPost('https://auth.example.com/token').reply(200, { access_token: 'tok' });

        const instance = buildClient({
            baseURL: 'http://api.example.com',
            auth: {
                strategy: AuthStrategy.TokenExchange,
                request: { method: 'POST', url: 'https://auth.example.com/token' },
                tokenExtractor: 'access_token',
                transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
            }
        }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/data').reply(200, { ok: true });

        await instance.get('/data');

        const providers = logger.info.mock.calls.map(([, meta]) => meta?.['provider']);
        expect(providers).toContain('api:auth');
        expect(providers).toContain('api');

        mock.restore();
        globalMock.restore();
    });

    it('logs the 401 and its replay as separate exchanges', async () => {
        const logger = buildLogger();
        const instance = buildClient({
            baseURL: 'http://api.example.com',
            auth: {
                strategy: AuthStrategy.None,
                transport: { headers: [{ name: 'X-Api-Key', value: 'static' }] }
            }
        }, logger);
        const mock = new MockAdapter(instance);
        mock.onGet('/data').replyOnce(401).onGet('/data').replyOnce(200, { ok: true });

        await expect(instance.get('/data')).resolves.toMatchObject({ status: 200 });

        // One failure line for the 401, one success line for the replay —
        // neither swallowed by the auth retry nor double-counted. This is what
        // the factory's pre-interceptor seam buys.
        expect(logger.error).toHaveBeenCalledOnce();
        expect(logger.info).toHaveBeenCalledOnce();
        mock.restore();
    });
});
