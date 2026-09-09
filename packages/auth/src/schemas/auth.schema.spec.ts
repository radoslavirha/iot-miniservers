import { describe, expect, it } from 'vitest';
import { VerifierType } from '../VerifierType.js';
import { TEST_METHOD } from '../test/FakeTokenVerifier.js';
import {
    AuthConfigSchema,
    createAuthConfigSchema,
    JwtVerifierSchema,
    KeySchema,
    TrustedIssuerSchema
} from './auth.schema.js';

const staticKey = { source: 'value' as const, algorithm: 'HS256', value: 'local-dev-secret' };
const jwksKey = { source: 'jwks' as const, uri: 'https://auth.test/jwks' };

const entry = (...trustedIssuers: unknown[]) => ({ type: VerifierType.BearerJwt, trustedIssuers });

const devIssuer = {
    name: 'dev-local',
    issuer: 'dev',
    key: staticKey,
    audience: 'qr-manager-api',
    subjectKind: 'service'
};

describe('AuthConfigSchema', () => {
    it('accepts an empty object, which configures nothing rather than disabling anything', () => {
        expect(AuthConfigSchema.parse({})).toEqual({});
    });

    it('is only the method map — no switch, no route list, nothing beside it', () => {
        // Every field proposed for this level was either a state where a
        // forgotten key leaves a service unauthenticated, or a copy of something
        // the source already says. The open form cannot judge a *key* — the
        // names are the service's — but every value must be a real verifier, so
        // none of these parses.
        for (const stray of [{ mode: 'disabled' }, { enabled: false }, { anonymousRoutes: ['/health'] }]) {
            expect(() => AuthConfigSchema.parse(stray)).toThrow();
        }
    });

    it('takes any name, because the names belong to the service', () => {
        expect(AuthConfigSchema.parse({ ANYTHING: entry(devIssuer) })).toHaveProperty('ANYTHING');
    });

    it('files each verifier under its method, so one method appears at most once', () => {
        const parsed = AuthConfigSchema.parse({ [TEST_METHOD]: entry(devIssuer) });

        expect(parsed[TEST_METHOD]?.trustedIssuers[0]).toMatchObject({
            name: 'dev-local',
            issuer: 'dev',
            audience: 'qr-manager-api',
            subjectKind: 'service',
            rolesClaim: 'roles'
        });
    });

    it('rejects an entry whose verifier type nothing implements', () => {
        expect(() => AuthConfigSchema.parse({ [TEST_METHOD]: { type: 'dummy' } })).toThrow();
    });
});

describe('createAuthConfigSchema', () => {
    const schema = createAuthConfigSchema([TEST_METHOD]);

    it('requires every method the service names, failing at boot rather than at a request', () => {
        // The whole reason the block is a map: a missing key can be required,
        // where a missing array element can only be counted after the fact.
        expect(() => schema.parse({})).toThrow(new RegExp(TEST_METHOD));
    });

    it('accepts a config that supplies them', () => {
        expect(schema.parse({ [TEST_METHOD]: entry(devIssuer) })[TEST_METHOD].trustedIssuers).toHaveLength(1);
    });

    it('rejects a name the service did not declare, so a typo is not a silent no-op', () => {
        // Strict where the open form cannot be: here the key set is known, and a
        // stripped `USRE` would leave the service with no verifier at all.
        expect(() => schema.parse({ [TEST_METHOD]: entry(devIssuer), TYPO: entry(devIssuer) }))
            .toThrow(/Unrecognized key/);
    });

    it('names the missing path, so the error says which key to add', () => {
        const result = schema.safeParse({});

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual([TEST_METHOD]);
    });

    it('builds an empty schema for a service that guards nothing', () => {
        expect(createAuthConfigSchema([]).parse({})).toEqual({});
    });
});

describe('JwtVerifierSchema', () => {
    it('refuses a verifier that trusts nobody, since it could never verify anything', () => {
        // Loud at boot beats a service that is up, healthy, and refusing all
        // traffic — which reads as a network fault and gets debugged for an hour.
        expect(() => JwtVerifierSchema.parse(entry())).toThrow(/at least one trusted issuer/);
    });

    it('lets two entries share a type, which is why the name is not the mechanism', () => {
        // The limitation the split exists to remove: one `jwt` key meant every
        // guarded route shared one issuer list, so a cluster's ServiceAccount
        // token was accepted anywhere a human's was.
        const schema = createAuthConfigSchema([TEST_METHOD]);
        const parsed = schema.parse({ [TEST_METHOD]: entry(devIssuer) });

        expect(parsed[TEST_METHOD].type).toBe(VerifierType.BearerJwt);
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
            refreshCooldownMs: 30_000,
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

    it('bounds how fast a miss may refetch, so unknown kids cannot hammer the IdP', () => {
        expect(KeySchema.parse(jwksKey)).toHaveProperty('refreshCooldownMs', 30_000);
        expect(() => KeySchema.parse({ ...jwksKey, refreshCooldownMs: 0 })).toThrow();
    });

    it('requires a real URL for a JWKS key', () => {
        expect(() => KeySchema.parse({ ...jwksKey, uri: 'auth.test/jwks' })).toThrow();
    });

    it('discriminates on source', () => {
        expect(() => KeySchema.parse({ source: 'file', path: '/tmp/key' })).toThrow();
    });
});
