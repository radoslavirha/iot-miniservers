import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { beforeEach, describe, expect, it } from 'vitest';
import { AxiosHttpClient } from './AxiosHttpClient.js';

const MockAdapter = AxiosMockAdapter as unknown as new (
    instance: AxiosInstance,
    options?: Record<string, unknown>
) => AxiosMockAdapter;

describe('AxiosHttpClient', () => {
    let client: AxiosHttpClient;
    let mock: AxiosMockAdapter;

    beforeEach(() => {
        const instance = axios.create({ baseURL: 'https://api.test' });
        client = new AxiosHttpClient(instance);
        mock = new MockAdapter(instance);
    });

    it('exposes the configured base URL', () => {
        expect(client.baseURL).toBe('https://api.test');
    });

    it('exposes the transport as an escape hatch', () => {
        expect(client.raw).toBeDefined();
    });

    describe('verbs', () => {
        it('resolves to the response body, not the envelope', async () => {
            expect.assertions(1);
            mock.onGet('/things').reply(200, { ok: true });

            await expect(client.get('/things')).resolves.toEqual({ ok: true });
        });

        it.each([
            ['post', 'onPost'],
            ['put', 'onPut'],
            ['patch', 'onPatch']
        ] as const)('%s sends the body and resolves to the response body', async (verb, onVerb) => {
            expect.assertions(2);
            mock[onVerb]('/things').reply(200, { created: true });

            await expect(client[verb]('/things', { name: 'cog' })).resolves.toEqual({ created: true });
            expect(JSON.parse(String(mock.history[verb]?.[0]?.data))).toEqual({ name: 'cog' });
        });

        it('query sends a body with GET-like semantics', async () => {
            expect.assertions(3);
            // axios-mock-adapter has no QUERY support, so capture at the adapter.
            const instance = axios.create({ baseURL: 'https://api.test' });
            let sent: { method?: string; data?: unknown } = {};
            instance.defaults.adapter = (async (config) => {
                sent = { method: config.method, data: config.data };
                return { config, data: { hits: 1 }, status: 200, statusText: 'OK', headers: {} };
            }) as AxiosAdapter;

            const result = await new AxiosHttpClient(instance).query('/search', { term: 'cog' });

            expect(result).toEqual({ hits: 1 });
            expect(String(sent.method).toUpperCase()).toBe('QUERY');
            expect(JSON.parse(String(sent.data))).toEqual({ term: 'cog' });
        });

        it('delete resolves to the response body', async () => {
            expect.assertions(1);
            mock.onDelete('/things/1').reply(200, { deleted: true });

            await expect(client.delete('/things/1')).resolves.toEqual({ deleted: true });
        });

        it('defaults to GET for a bare request', async () => {
            expect.assertions(1);
            mock.onGet('/things').reply(200, {});

            await client.request({ url: '/things' });

            expect(mock.history['get']).toHaveLength(1);
        });
    });

    describe('option mapping', () => {
        it('forwards headers and query parameters', async () => {
            expect.assertions(2);
            mock.onGet('/things').reply(200, {});

            await client.get('/things', { headers: { 'X-Trace': 'abc' }, params: { page: 2 } });

            expect(mock.history['get']?.[0]?.headers?.['X-Trace']).toBe('abc');
            expect(mock.history['get']?.[0]?.params).toEqual({ page: 2 });
        });

        it('maps the neutral binary response type onto the transport', async () => {
            expect.assertions(1);
            mock.onGet('/image').reply(200, Buffer.from('bytes'));

            await client.get('/image', { responseType: 'binary' });

            expect(mock.history['get']?.[0]?.responseType).toBe('arraybuffer');
        });

        it.each([
            ['json', 'json'],
            ['text', 'text']
        ] as const)('maps the %s response type', async (neutral, expected) => {
            expect.assertions(1);
            mock.onGet('/thing').reply(200, {});

            await client.get('/thing', { responseType: neutral });

            expect(mock.history['get']?.[0]?.responseType).toBe(expected);
        });

        it('forwards an abort signal', async () => {
            expect.assertions(1);
            const controller = new AbortController();
            controller.abort();
            mock.onGet('/slow').reply(200, {});

            await expect(client.get('/slow', { signal: controller.signal })).rejects.toBeDefined();
        });

        it('omits options that were not provided', async () => {
            expect.assertions(2);
            mock.onGet('/things').reply(200, {});

            await client.get('/things');

            expect(mock.history['get']?.[0]?.params).toBeUndefined();
            expect(mock.history['get']?.[0]?.responseType).toBeUndefined();
        });
    });
});
