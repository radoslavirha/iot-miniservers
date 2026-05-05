import { AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { applyTransport } from './applyTransport.js';
import type { InternalAxiosRequestConfig } from 'axios';

function makeConfig(): InternalAxiosRequestConfig {
    return {
        headers: new AxiosHeaders()
    } as InternalAxiosRequestConfig;
}

describe('applyTransport', () => {
    it('injects a static header', () => {
        const config = makeConfig();
        applyTransport(config, { headers: [{ name: 'X-Api-Key', value: 'secret' }] });
        expect(config.headers.get('X-Api-Key')).toBe('secret');
    });

    it('injects a static query param', () => {
        const config = makeConfig();
        applyTransport(config, { queryParams: [{ name: 'apiKey', value: 'abc123' }] });
        expect((config.params as Record<string, string>)['apiKey']).toBe('abc123');
    });

    it('interpolates {{value}} placeholder from credentials', () => {
        const config = makeConfig();
        applyTransport(
            config,
            { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] },
            { value: 'my-token' }
        );
        expect(config.headers.get('Authorization')).toBe('Bearer my-token');
    });

    it('interpolates named placeholder from credentials', () => {
        const config = makeConfig();
        applyTransport(
            config,
            { headers: [{ name: 'Authorization', value: 'Bearer {{accessToken}}' }] },
            { accessToken: 'tok123' }
        );
        expect(config.headers.get('Authorization')).toBe('Bearer tok123');
    });

    it('injects multiple headers', () => {
        const config = makeConfig();
        applyTransport(config, {
            headers: [
                { name: 'X-Api-Key', value: 'key1' },
                { name: 'X-Client-Id', value: 'cid' }
            ]
        });
        expect(config.headers.get('X-Api-Key')).toBe('key1');
        expect(config.headers.get('X-Client-Id')).toBe('cid');
    });

    it('injects both headers and query params', () => {
        const config = makeConfig();
        applyTransport(config, {
            headers: [{ name: 'X-Auth', value: 'a' }],
            queryParams: [{ name: 'token', value: 'b' }]
        });
        expect(config.headers.get('X-Auth')).toBe('a');
        expect((config.params as Record<string, string>)['token']).toBe('b');
    });

    it('throws when placeholder has no matching credential', () => {
        const config = makeConfig();
        expect(() =>
            applyTransport(config, { headers: [{ name: 'Auth', value: 'Bearer {{missing}}' }] }, {})
        ).toThrow('{{missing}}');
    });

    it('does nothing when transport has no headers or queryParams', () => {
        const config = makeConfig();
        const before = JSON.stringify(config.params);
        applyTransport(config, {});
        expect(JSON.stringify(config.params)).toBe(before);
    });
});
