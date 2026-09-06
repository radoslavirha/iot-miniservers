import { describe, expect, it } from 'vitest';
import { AuthConfigSchema, KeySchema, TrustedIssuerSchema } from './auth.schema.js';

const staticKey = { source: 'value' as const, algorithm: 'HS256', value: 'local-dev-secret' };
const jwksKey = { source: 'jwks' as const, uri: 'https://auth.test/jwks' };

describe('AuthConfigSchema', () => {
    it('accepts an empty object and defaults to disabled with nothing trusted', () => {
        expect(AuthConfigSchema.parse({})).toEqual({
            mode: 'disabled',
            trustedIssuers: [],
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
        expect(AuthConfigSchema.parse({ anonymousRoutes: ['/health', '/r/:slug'] }).anonymousRoutes)
            .toEqual(['/health', '/r/:slug']);
    });

    it('parses the local-development issuer row from the design doc', () => {
        const parsed = AuthConfigSchema.parse({
            mode: 'enforced',
            trustedIssuers: [{
                name: 'dev-local',
                issuer: 'dev',
                key: { source: 'value', algorithm: 'HS256', value: 'local-dev-secret' },
                audience: 'qr-manager-api',
                subjectKind: 'service'
            }]
        });

        expect(parsed.mode).toBe('enforced');
        expect(parsed.trustedIssuers[0]).toMatchObject({
            name: 'dev-local',
            issuer: 'dev',
            audience: 'qr-manager-api',
            subjectKind: 'service',
            rolesClaim: 'roles'
        });
    });
});

describe('TrustedIssuerSchema', () => {
    const minimal = { name: 'idp', issuer: 'https://auth.test/app/', audience: 'my-api', key: staticKey };

    it('defaults subjectKind and rolesClaim', () => {
        const parsed = TrustedIssuerSchema.parse(minimal);

        expect(parsed.subjectKind).toBe('human');
        expect(parsed.rolesClaim).toBe('roles');
    });

    it('never strips the trailing slash from the issuer', () => {
        expect(TrustedIssuerSchema.parse(minimal).issuer).toBe('https://auth.test/app/');
    });

    it('requires a name, because the boot log identifies issuers by it', () => {
        expect(() => TrustedIssuerSchema.parse({ ...minimal, name: undefined })).toThrow();
        expect(() => TrustedIssuerSchema.parse({ ...minimal, name: '' })).toThrow();
    });

    it('requires an audience, because a valid token minted for someone else must be refused', () => {
        expect(() => TrustedIssuerSchema.parse({ ...minimal, audience: undefined })).toThrow();
        expect(() => TrustedIssuerSchema.parse({ ...minimal, audience: '' })).toThrow();
    });

    it('rejects an empty issuer', () => {
        expect(() => TrustedIssuerSchema.parse({ ...minimal, issuer: '' })).toThrow();
    });

    it('accepts the service and device caller classes', () => {
        expect(TrustedIssuerSchema.parse({ ...minimal, subjectKind: 'service' }).subjectKind).toBe('service');
        expect(TrustedIssuerSchema.parse({ ...minimal, subjectKind: 'device' }).subjectKind).toBe('device');
        expect(() => TrustedIssuerSchema.parse({ ...minimal, subjectKind: 'robot' })).toThrow();
    });
});

describe('KeySchema', () => {
    it('defaults a static key to HS256', () => {
        expect(KeySchema.parse({ source: 'value', value: 'secret' })).toEqual({
            source: 'value',
            algorithm: 'HS256',
            value: 'secret'
        });
    });

    it('rejects a static key with no value', () => {
        expect(() => KeySchema.parse({ source: 'value', value: '' })).toThrow();
    });

    it('defaults a JWKS key to anonymous RS256 with a cache and a timeout', () => {
        expect(KeySchema.parse(jwksKey)).toEqual({
            source: 'jwks',
            uri: 'https://auth.test/jwks',
            auth: 'none',
            algorithms: ['RS256'],
            cacheTtlSeconds: 300,
            timeoutMs: 3000
        });
    });

    it('accepts serviceAccountToken, which is the whole Kubernetes special case', () => {
        expect(KeySchema.parse({ ...jwksKey, auth: 'serviceAccountToken' }))
            .toHaveProperty('auth', 'serviceAccountToken');
        expect(() => KeySchema.parse({ ...jwksKey, auth: 'basic' })).toThrow();
    });

    it('always yields a JWKS timeout, so an unreachable endpoint cannot hang a request', () => {
        expect(KeySchema.parse(jwksKey)).toHaveProperty('timeoutMs', 3000);
        expect(() => KeySchema.parse({ ...jwksKey, timeoutMs: 0 })).toThrow();
        expect(() => KeySchema.parse({ ...jwksKey, timeoutMs: -1 })).toThrow();
    });

    it('requires a real URL for a JWKS key', () => {
        expect(() => KeySchema.parse({ ...jwksKey, uri: 'auth.test/jwks' })).toThrow();
    });

    it('discriminates on source', () => {
        expect(() => KeySchema.parse({ source: 'file', path: '/tmp/key' })).toThrow();
    });
});
