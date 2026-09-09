import { describe, expect, it } from 'vitest';
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';
import { JwtVerifier } from './JwtVerifier.js';
import { StaticKeySource } from '../keys/StaticKeySource.js';
import { TrustedIssuerSchema } from '../schemas/auth.schema.js';
import { mintTestToken, TEST_SECRET } from '../test/mintTestToken.js';
import type { IKeySource } from '../IKeySource.js';
import { credentialSourceOf } from '../CredentialSource.js';

const ISSUER = 'https://issuer.test/';
const AUDIENCE = 'test-audience';

const issuerRow = (overrides: Record<string, unknown> = {}) =>
    TrustedIssuerSchema.parse({
        name: 'dev-local',
        issuer: ISSUER,
        audience: AUDIENCE,
        key: { source: 'value', algorithm: 'HS256', value: TEST_SECRET },
        ...overrides
    });

const verifierFor = (...rows: ReturnType<typeof issuerRow>[]) =>
    new JwtVerifier(rows, new StaticKeySource(rows));

describe('JwtVerifier — the HS256 round trip', () => {
    it('verifies a token minted for it and yields a principal', async () => {
        const row = issuerRow();
        const token = await mintTestToken({ claims: { roles: ['qr-manager.admin'], preferred_username: 'claude' } });

        const outcome = await verifierFor(row).verify(token);

        expect(outcome).toEqual({
            reason: 'ok',
            principal: {
                subject: 'test-subject',
                kind: 'human',
                displayName: 'claude',
                roles: ['qr-manager.admin'],
                issuer: ISSUER
            }
        });
    });

    it('stamps subjectKind from the issuer row, not from the token', async () => {
        const row = issuerRow({ subjectKind: 'service' });
        const outcome = await verifierFor(row).verify(await mintTestToken({ claims: { kind: 'human' } }));

        expect(outcome).toHaveProperty('principal.kind', 'service');
    });

    it('reads roles from the configured claim', async () => {
        const row = issuerRow({ rolesClaim: 'groups' });
        const outcome = await verifierFor(row).verify(await mintTestToken({ claims: { groups: ['a'], roles: ['b'] } }));

        expect(outcome).toHaveProperty('principal.roles', ['a']);
    });

    it('treats a missing roles claim as no roles, not an error', async () => {
        const outcome = await verifierFor(issuerRow()).verify(await mintTestToken());

        expect(outcome).toHaveProperty('principal.roles', []);
    });

    it('drops non-string role entries rather than coercing them', async () => {
        const outcome = await verifierFor(issuerRow()).verify(await mintTestToken({ claims: { roles: ['a', 1, null] } }));

        expect(outcome).toHaveProperty('principal.roles', ['a']);
    });
});

describe('JwtVerifier — refusals', () => {
    it('reports an empty credential as missing, not invalid', async () => {
        expect(await verifierFor(issuerRow()).verify('')).toEqual({ reason: 'missing' });
        expect(await verifierFor(issuerRow()).verify('   ')).toEqual({ reason: 'missing' });
    });

    it('reports garbage as invalid', async () => {
        expect((await verifierFor(issuerRow()).verify('not-a-jwt')).reason).toBe('invalid');
    });

    it('reports an unconfigured issuer as unknown-issuer', async () => {
        const outcome = await verifierFor(issuerRow()).verify(await mintTestToken({ issuer: 'https://elsewhere.test/' }));

        expect(outcome.reason).toBe('unknown-issuer');
        expect(outcome).toHaveProperty('detail', expect.stringContaining('elsewhere.test'));
    });

    it('reports a token minted for another audience as wrong-audience', async () => {
        const outcome = await verifierFor(issuerRow()).verify(await mintTestToken({ audience: 'someone-else' }));

        expect(outcome.reason).toBe('wrong-audience');
    });

    it('reports an expired token as invalid', async () => {
        const outcome = await verifierFor(issuerRow()).verify(await mintTestToken({ expiresIn: '-5m' }));

        expect(outcome.reason).toBe('invalid');
    });

    it('reports a token signed with the wrong secret as invalid', async () => {
        const outcome = await verifierFor(issuerRow()).verify(await mintTestToken({ secret: 'a-different-secret-000000000000' }));

        expect(outcome.reason).toBe('invalid');
    });

    it('refuses a token with no sub rather than inventing a subject', async () => {
        // Minted by hand: mintTestToken always sets a subject.
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setIssuer(ISSUER)
            .setAudience(AUDIENCE)
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(TEST_SECRET));

        const outcome = await verifierFor(issuerRow()).verify(token);

        expect(outcome).toEqual({ reason: 'invalid', detail: 'token carries no sub claim' });
    });

    it('refuses a token with no iss, because no trust source can be selected', async () => {
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('s')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(TEST_SECRET));

        expect(await verifierFor(issuerRow()).verify(token)).toEqual({
            reason: 'invalid',
            detail: 'token carries no iss claim'
        });
    });
});

describe('JwtVerifier — algorithm confusion', () => {
    it('refuses an HS256 token when the issuer is configured for RS256', async () => {
        // The classic attack: sign with the RSA public key as an HMAC secret and
        // hope the verifier trusts the header's `alg`.
        const { publicKey } = await generateKeyPair('RS256');
        const spki = await exportSPKI(publicKey);
        const row = issuerRow({ key: { source: 'value', algorithm: 'RS256', value: spki } });

        const forged = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('attacker')
            .setIssuer(ISSUER)
            .setAudience(AUDIENCE)
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(spki));

        const outcome = await verifierFor(row).verify(forged);

        // `invalid`, specifically — a forged token is the credential's fault.
        // Reporting it as `indeterminate` would file an attack under "the IdP
        // might be down".
        expect(outcome.reason).toBe('invalid');
    });

    it('verifies a genuine RS256 token against a PEM public key', async () => {
        const { publicKey, privateKey } = await generateKeyPair('RS256');
        const row = issuerRow({ key: { source: 'value', algorithm: 'RS256', value: await exportSPKI(publicKey) } });

        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'RS256' })
            .setSubject('rs256-subject')
            .setIssuer(ISSUER)
            .setAudience(AUDIENCE)
            .setExpirationTime('1h')
            .sign(privateKey);

        expect(await verifierFor(row).verify(token)).toHaveProperty('principal.subject', 'rs256-subject');
    });
});

describe('JwtVerifier — a JWKS-backed row', () => {
    it('takes its algorithm allowlist from the jwks row, not from the token header', async () => {
        // The key comes from a stand-in source; what is under test is that the
        // allowlist is read from `key.algorithms` when the row is jwks-backed.
        const row = issuerRow({ key: { source: 'jwks', uri: 'https://idp.test/jwks', algorithms: ['HS256'] } });
        const keys: IKeySource = { getKey: () => Promise.resolve(new TextEncoder().encode(TEST_SECRET)) };

        const outcome = await new JwtVerifier([row], keys).verify(await mintTestToken());

        expect(outcome).toHaveProperty('principal.subject', 'test-subject');
    });

    it('refuses a token whose algorithm is outside the jwks allowlist', async () => {
        const row = issuerRow({ key: { source: 'jwks', uri: 'https://idp.test/jwks', algorithms: ['RS256'] } });
        const keys: IKeySource = { getKey: () => Promise.resolve(new TextEncoder().encode(TEST_SECRET)) };

        expect((await new JwtVerifier([row], keys).verify(await mintTestToken())).reason).toBe('invalid');
    });
});

describe('JwtVerifier — key source failures', () => {
    it('reports an unreachable key source as indeterminate, never as invalid', async () => {
        // The distinction the whole outcome type exists for: an IdP outage must
        // not read as a wave of bad tokens.
        const unreachable: IKeySource = {
            getKey: () => Promise.reject(new Error('JWKS fetch timed out'))
        };
        const row = issuerRow();

        const outcome = await new JwtVerifier([row], unreachable).verify(await mintTestToken());

        expect(outcome).toEqual({ reason: 'indeterminate', detail: 'JWKS fetch timed out' });
    });

    it('survives a key source that rejects with something that is not an Error', async () => {
        const odd: IKeySource = { getKey: () => Promise.reject('boom') };

        const outcome = await new JwtVerifier([issuerRow()], odd).verify(await mintTestToken());

        expect(outcome).toEqual({ reason: 'indeterminate', detail: 'boom' });
    });
});

describe('JwtVerifier — several trust sources', () => {
    it('matches a token to its issuer, not to position', async () => {
        const other = issuerRow({
            name: 'other',
            issuer: 'https://other.test/',
            audience: 'other-audience',
            subjectKind: 'device',
            key: { source: 'value', algorithm: 'HS256', value: 'another-secret-0000000000000000' }
        });
        const verifier = verifierFor(other, issuerRow());

        const mine = await verifier.verify(await mintTestToken());
        const theirs = await verifier.verify(
            await mintTestToken({
                issuer: 'https://other.test/',
                audience: 'other-audience',
                secret: 'another-secret-0000000000000000'
            })
        );

        expect(mine).toHaveProperty('principal.kind', 'human');
        expect(theirs).toHaveProperty('principal.kind', 'device');
    });
});

describe('JwtVerifier.extract', () => {
    // Moved here from the Ts.ED guard, which used to own bearer parsing. The
    // mechanism knows how its credential travels; the transport does not.
    const verifier = () => new JwtVerifier([], new StaticKeySource([]));
    const from = (headers: Record<string, string>) => verifier().extract(credentialSourceOf(headers));

    it('extracts the token from a bearer header', () => {
        expect(from({ authorization: 'Bearer abc.def.ghi' })).toBe('abc.def.ghi');
    });

    it('matches the scheme case-insensitively, because clients send lowercase', () => {
        expect(from({ authorization: 'bearer abc' })).toBe('abc');
        expect(from({ authorization: 'BEARER abc' })).toBe('abc');
    });

    it('finds the header whatever case the transport spelled it in', () => {
        expect(from({ Authorization: 'Bearer abc' })).toBe('abc');
    });

    it('tolerates surrounding and repeated whitespace', () => {
        expect(from({ authorization: '  Bearer   abc  ' })).toBe('abc');
    });

    it('ignores a non-bearer scheme rather than passing it on as garbage', () => {
        // Two reasons. Reaching the JWT parser, `Basic …` would be counted as
        // `invalid`, which reads as an attack rather than a client using the
        // wrong scheme. And on a route admitting several methods, "not mine"
        // must let the next verifier answer.
        expect(from({ authorization: 'Basic dXNlcjpwYXNz' })).toBeUndefined();
    });

    it('ignores a bearer scheme with no token', () => {
        expect(from({ authorization: 'Bearer' })).toBeUndefined();
        expect(from({ authorization: 'Bearer   ' })).toBeUndefined();
    });

    it('returns undefined when there is no header at all', () => {
        expect(from({})).toBeUndefined();
    });
});
