import { describe, expect, it } from 'vitest';
import { AuthConfigSchema, KeySourceSchema, TrustedIssuerSchema } from './auth.schema.js';

const jwks = { kind: 'jwks' as const, url: 'https://auth.test/jwks' };

describe('AuthConfigSchema', () => {
    it('accepts an empty object and defaults to disabled with nothing trusted', () => {
        expect(AuthConfigSchema.parse({})).toEqual({
            mode: 'disabled',
            issuers: [],
            anonymousRoutes: []
        });
    });

    it('accepts the three modes and rejects anything else', () => {
        for (const mode of ['disabled', 'permissive', 'enforced']) {
            expect(AuthConfigSchema.parse({ mode }).mode).toBe(mode);
        }
        expect(() => AuthConfigSchema.parse({ mode: 'on' })).toThrow();
    });

    it('keeps anonymous routes as authored', () => {
        const parsed = AuthConfigSchema.parse({ anonymousRoutes: ['/health', '/r/:slug'] });
        expect(parsed.anonymousRoutes).toEqual(['/health', '/r/:slug']);
    });
});

describe('TrustedIssuerSchema', () => {
    const minimal = { issuer: 'https://auth.test/app/', audience: 'my-api', keySource: jwks };

    it('defaults principalKind, rolesClaim and algorithms', () => {
        const parsed = TrustedIssuerSchema.parse(minimal);

        expect(parsed.principalKind).toBe('human');
        expect(parsed.rolesClaim).toBe('roles');
        expect(parsed.algorithms).toEqual(['RS256']);
    });

    it('never strips the trailing slash from the issuer', () => {
        expect(TrustedIssuerSchema.parse(minimal).issuer).toBe('https://auth.test/app/');
    });

    it('requires an audience, because a valid token minted for someone else must be refused', () => {
        expect(() => TrustedIssuerSchema.parse({ ...minimal, audience: undefined })).toThrow();
        expect(() => TrustedIssuerSchema.parse({ ...minimal, audience: '' })).toThrow();
    });

    it('rejects an empty issuer', () => {
        expect(() => TrustedIssuerSchema.parse({ ...minimal, issuer: '' })).toThrow();
    });

    it('accepts the service and device caller classes', () => {
        expect(TrustedIssuerSchema.parse({ ...minimal, principalKind: 'service' }).principalKind).toBe('service');
        expect(TrustedIssuerSchema.parse({ ...minimal, principalKind: 'device' }).principalKind).toBe('device');
        expect(() => TrustedIssuerSchema.parse({ ...minimal, principalKind: 'robot' })).toThrow();
    });
});

describe('KeySourceSchema', () => {
    it('defaults the cache TTL, the timeout and the service-account flag', () => {
        expect(KeySourceSchema.parse(jwks)).toEqual({
            kind: 'jwks',
            url: 'https://auth.test/jwks',
            cacheTtlSeconds: 300,
            timeoutMs: 3000,
            serviceAccountToken: false
        });
    });

    it('always yields a timeout, so an unreachable JWKS cannot hang a request', () => {
        expect(KeySourceSchema.parse(jwks).timeoutMs).toBeGreaterThan(0);
        expect(() => KeySourceSchema.parse({ ...jwks, timeoutMs: 0 })).toThrow();
        expect(() => KeySourceSchema.parse({ ...jwks, timeoutMs: -1 })).toThrow();
    });

    it('requires a real URL', () => {
        expect(() => KeySourceSchema.parse({ ...jwks, url: 'auth.test/jwks' })).toThrow();
    });

    it('discriminates on kind', () => {
        expect(() => KeySourceSchema.parse({ ...jwks, kind: 'static' })).toThrow();
    });
});
