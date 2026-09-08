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

    it('places a named credential in the header that claims it', () => {
        const config = makeConfig();
        applyTransport(
            config,
            { headers: [{ name: 'Authorization', credential: 'value', prefix: 'Bearer ' }] },
            { value: 'my-token' }
        );
        expect(config.headers.get('Authorization')).toBe('Bearer my-token');
    });

    it('routes each credential to its own header', () => {
        // The reason `credential` is a field rather than a placeholder: one token
        // response, several fields, each landing somewhere different — without a
        // code change and without a templating syntax.
        const config = makeConfig();
        applyTransport(
            config,
            {
                headers: [
                    { name: 'Authorization', credential: 'access', prefix: 'Bearer ' },
                    { name: 'X-Refresh-Token', credential: 'refresh' }
                ]
            },
            { access: 'tok123', refresh: 'ref456' }
        );
        expect(config.headers.get('Authorization')).toBe('Bearer tok123');
        expect(config.headers.get('X-Refresh-Token')).toBe('ref456');
    });

    it('wraps a credential in both prefix and suffix', () => {
        // The cookie shape, which is the only reason suffix exists.
        const config = makeConfig();
        applyTransport(
            config,
            { headers: [{ name: 'Cookie', credential: 'value', prefix: 'session=', suffix: '; Path=/' }] },
            { value: 'abc' }
        );
        expect(config.headers.get('Cookie')).toBe('session=abc; Path=/');
    });

    it('sends the credential bare when neither prefix nor suffix is configured', () => {
        const config = makeConfig();
        applyTransport(config, { headers: [{ name: 'X-Api-Key', credential: 'value' }] }, { value: 'k' });
        expect(config.headers.get('X-Api-Key')).toBe('k');
    });

    it('puts a credential in a query param too', () => {
        const config = makeConfig();
        applyTransport(config, { queryParams: [{ name: 'token', credential: 'value' }] }, { value: 't' });
        expect((config.params as Record<string, string>)['token']).toBe('t');
    });

    it('injects multiple static headers', () => {
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

    it('throws when the named credential was never produced', () => {
        const config = makeConfig();
        expect(() =>
            applyTransport(config, { headers: [{ name: 'Auth', credential: 'missing' }] }, {})
        ).toThrow('missing');
    });

    it('throws rather than sending a bare prefix when the credential is empty', () => {
        // The failure this design exists to make loud. Sending `Bearer ` would
        // come back as a 401 from the far end, indistinguishable from a genuine
        // refusal, and the real fault — a renamed field in the token response —
        // would be nowhere in the message.
        const config = makeConfig();
        expect(() =>
            applyTransport(
                config,
                { headers: [{ name: 'Authorization', credential: 'value', prefix: 'Bearer ' }] },
                { value: '' }
            )
        ).toThrow('Authorization');
    });

    it('does nothing when transport has no headers or queryParams', () => {
        const config = makeConfig();
        const before = JSON.stringify(config.params);
        applyTransport(config, {});
        expect(JSON.stringify(config.params)).toBe(before);
    });
});
