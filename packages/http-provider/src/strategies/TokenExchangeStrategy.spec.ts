import axios, { type AxiosInstance } from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthStrategy, TokenExchangeAuthSchema } from '../schemas/auth.schema.js';
import type { TokenExchangeAuth } from '../schemas/auth.schema.js';
import { TokenExchangeStrategy } from './TokenExchangeStrategy.js';

// AxiosMockAdapter types differ between CJS and ESM axios resolution — cast needed
const MockAdapter = AxiosMockAdapter as unknown as new (instance: AxiosInstance, options?: Record<string, unknown>) => AxiosMockAdapter;

const TOKEN_URL = 'https://auth.example.com/token';

const POST_CONFIG: TokenExchangeAuth = {
    strategy: AuthStrategy.TokenExchange,
    request: {
        method: 'POST',
        url: TOKEN_URL,
        body: { client_id: 'x', client_secret: 'y' }
    },
    tokenExtractor: [{ field: 'access_token', as: 'accessToken' }],
    transport: { headers: [{ name: 'Authorization', value: 'Bearer {{accessToken}}' }] }
};

const MULTI_EXTRACTOR_CONFIG: TokenExchangeAuth = {
    strategy: AuthStrategy.TokenExchange,
    request: { method: 'POST', url: TOKEN_URL },
    tokenExtractor: [
        { field: 'access_token', as: 'accessToken' },
        { field: 'refresh_token', as: 'refreshToken' }
    ],
    transport: { headers: [{ name: 'Authorization', value: 'Bearer {{accessToken}}' }] }
};

describe('TokenExchangeStrategy', () => {
    let mock: AxiosMockAdapter;

    beforeEach(() => {
        mock = new MockAdapter(axios as unknown as AxiosInstance);
    });

    afterEach(() => {
        mock.restore();
    });

    it('fetches and returns credentials from POST response', async () => {
        mock.onPost(TOKEN_URL).reply(200, { access_token: 'tok123' });
        const strategy = new TokenExchangeStrategy(POST_CONFIG);
        const creds = await strategy.getCredentials();
        expect(creds).toEqual({ accessToken: 'tok123' });
        expect(mock.history['post']).toHaveLength(1);
        expect(JSON.parse(mock.history['post']![0]!.data as string)).toEqual({ client_id: 'x', client_secret: 'y' });
    });

    it('caches credentials on second call', async () => {
        mock.onPost(TOKEN_URL).reply(200, { access_token: 'tok123' });
        const strategy = new TokenExchangeStrategy(POST_CONFIG);
        await strategy.getCredentials();
        await strategy.getCredentials();
        expect(mock.history['post']).toHaveLength(1);
    });

    it('deduplicates concurrent cold credential fetches', async () => {
        let releaseResponse: (() => void) | undefined;
        const responseReady = new Promise<void>((resolve) => {
            releaseResponse = resolve;
        });

        mock.onPost(TOKEN_URL).reply(async () => {
            await responseReady;
            return [200, { access_token: 'tok123' }];
        });

        const strategy = new TokenExchangeStrategy(POST_CONFIG);
        const firstPending = strategy.getCredentials();
        const secondPending = strategy.getCredentials();

        await Promise.resolve();
        releaseResponse?.();

        const [first, second] = await Promise.all([firstPending, secondPending]);

        expect(first).toEqual({ accessToken: 'tok123' });
        expect(second).toEqual(first);
        expect(mock.history['post']).toHaveLength(1);
    });

    it('starts a fresh fetch after invalidate while an older fetch is in flight', async () => {
        let releaseFirstResponse: (() => void) | undefined;
        const firstResponseReady = new Promise<void>((resolve) => {
            releaseFirstResponse = resolve;
        });
        let callCount = 0;

        mock.onPost(TOKEN_URL).reply(async () => {
            callCount += 1;
            if (callCount === 1) {
                await firstResponseReady;
                return [200, { access_token: 'stale-token' }];
            }
            return [200, { access_token: 'fresh-token' }];
        });

        const strategy = new TokenExchangeStrategy(POST_CONFIG);

        const firstPending = strategy.getCredentials();
        await Promise.resolve();
        strategy.invalidate();

        const second = await strategy.getCredentials();
        expect(second).toEqual({ accessToken: 'fresh-token' });

        releaseFirstResponse?.();
        await firstPending;

        const third = await strategy.getCredentials();
        expect(third).toEqual({ accessToken: 'fresh-token' });
        expect(mock.history['post']).toHaveLength(2);
    });

    it('re-fetches after invalidate()', async () => {
        mock.onPost(TOKEN_URL)
            .replyOnce(200, { access_token: 'tok-v1' })
            .onPost(TOKEN_URL)
            .reply(200, { access_token: 'tok-v2' });
        const strategy = new TokenExchangeStrategy(POST_CONFIG);
        const first = await strategy.getCredentials();
        strategy.invalidate();
        const second = await strategy.getCredentials();
        expect(first['accessToken']).toBe('tok-v1');
        expect(second['accessToken']).toBe('tok-v2');
        expect(mock.history['post']).toHaveLength(2);
    });

    it('extracts multiple credential fields', async () => {
        mock.onPost(TOKEN_URL).reply(200, { access_token: 'at', refresh_token: 'rt' });
        const strategy = new TokenExchangeStrategy(MULTI_EXTRACTOR_CONFIG);
        const creds = await strategy.getCredentials();
        expect(creds).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    });

    it('sends request headers when provided', async () => {
        mock.onGet(TOKEN_URL).reply(200, { access_token: 'tok' });
        const config: TokenExchangeAuth = {
            strategy: AuthStrategy.TokenExchange,
            request: {
                method: 'GET',
                url: TOKEN_URL,
                headers: [{ name: 'Authorization', value: 'Basic abc==' }]
            },
            tokenExtractor: [{ field: 'access_token', as: 'value' }],
            transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
        };
        const strategy = new TokenExchangeStrategy(config);
        await strategy.getCredentials();
        expect(mock.history['get']![0]!.headers?.['Authorization']).toBe('Basic abc==');
    });

    it('sends query params when provided', async () => {
        mock.onGet(TOKEN_URL).reply(200, { access_token: 'tok' });
        const config: TokenExchangeAuth = {
            strategy: AuthStrategy.TokenExchange,
            request: {
                method: 'GET',
                url: TOKEN_URL,
                queryParams: [{ name: 'grant_type', value: 'client_credentials' }]
            },
            tokenExtractor: [{ field: 'access_token', as: 'value' }],
            transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
        };
        const strategy = new TokenExchangeStrategy(config);
        await strategy.getCredentials();
        expect(mock.history['get']![0]!.params).toEqual({ grant_type: 'client_credentials' });
    });

    describe('schema', () => {
        it('transforms string shorthand tokenExtractor to array form', () => {
            const result = TokenExchangeAuthSchema.parse({
                strategy: AuthStrategy.TokenExchange,
                request: { url: TOKEN_URL },
                tokenExtractor: 'access_token',
                transport: { headers: [] }
            });
            expect(result.tokenExtractor).toEqual([{ field: 'access_token', as: 'value' }]);
        });
    });
});

