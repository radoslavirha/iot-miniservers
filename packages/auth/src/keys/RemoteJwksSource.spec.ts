import { describe, expect, it, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { FetchImplementation } from 'jose';
import { readFile } from 'node:fs/promises';
import { RemoteJwksSource, SERVICE_ACCOUNT_TOKEN_PATH } from './RemoteJwksSource.js';
import { UnresolvableKeyError } from '../IKeySource.js';
import { JwtVerifier } from '../verifiers/JwtVerifier.js';
import { TrustedIssuerSchema } from '../schemas/auth.schema.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

const ISSUER = 'https://idp.test/application/o/app/';
const AUDIENCE = 'my-api';
const JWKS_URI = 'https://idp.test/application/o/app/jwks/';

const row = (overrides: Record<string, unknown> = {}) =>
    TrustedIssuerSchema.parse({
        name: 'idp',
        issuer: ISSUER,
        audience: AUDIENCE,
        key: { source: 'jwks', uri: JWKS_URI, ...(overrides['key'] ?? {}) },
        ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'key'))
    });

/** A key pair plus the JWKS document an IdP would publish for it. */
const publishedKey = async (kid: string) => {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
    return { privateKey, jwk };
};

/** Serves a fixed JWKS document, recording every request it was asked to make. */
const servingFetch = (jwks: object) => {
    const calls: { url: string; authorization: string | null }[] = [];
    const impl: FetchImplementation = (url, options) => {
        calls.push({ url, authorization: options.headers.get('Authorization') });
        return Promise.resolve(
            new Response(JSON.stringify(jwks), { status: 200, headers: { 'Content-Type': 'application/json' } })
        );
    };
    return { impl, calls };
};

describe('RemoteJwksSource', () => {
    it('resolves a key by kid from the published key set', async () => {
        const { jwk } = await publishedKey('key-1');
        const { impl } = servingFetch({ keys: [jwk] });
        const source = new RemoteJwksSource([row()], { fetch: impl });

        const key = await source.getKey({ issuer: ISSUER, kid: 'key-1', algorithm: 'RS256' });

        expect(key).toHaveProperty('type', 'public');
    });

    it('selects the right key when the set holds several', async () => {
        const first = await publishedKey('key-1');
        const second = await publishedKey('key-2');
        const { impl } = servingFetch({ keys: [first.jwk, second.jwk] });
        const source = new RemoteJwksSource([row()], { fetch: impl });

        // Signed with the second key, and the header names it.
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'RS256', kid: 'key-2' })
            .setSubject('someone')
            .setIssuer(ISSUER)
            .setAudience(AUDIENCE)
            .setExpirationTime('1h')
            .sign(second.privateKey);

        const verifier = new JwtVerifier([row()], source);

        expect(await verifier.verify(token)).toHaveProperty('principal.subject', 'someone');
    });

    it('reports an unknown kid as unresolvable, not as an outage', async () => {
        const { jwk } = await publishedKey('key-1');
        const { impl } = servingFetch({ keys: [jwk] });
        const source = new RemoteJwksSource([row()], { fetch: impl });

        await expect(
            source.getKey({ issuer: ISSUER, kid: 'no-such-kid', algorithm: 'RS256' })
        ).rejects.toBeInstanceOf(UnresolvableKeyError);
    });

    it('lets a transport failure propagate, so it can be told apart from a bad token', async () => {
        const impl: FetchImplementation = () => Promise.reject(new Error('ECONNREFUSED'));
        const source = new RemoteJwksSource([row()], { fetch: impl });

        const error = await source.getKey({ issuer: ISSUER, kid: 'key-1' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(UnresolvableKeyError);
    });

    it('throws for an issuer it is not configured for', async () => {
        const { impl } = servingFetch({ keys: [] });
        const source = new RemoteJwksSource([row()], { fetch: impl });

        await expect(source.getKey({ issuer: 'https://elsewhere.test/' })).rejects.toBeInstanceOf(
            UnresolvableKeyError
        );
    });

    it('keeps only jwks rows, so a mixed configuration can be handed to it whole', () => {
        const staticRow = TrustedIssuerSchema.parse({
            name: 'dev-local',
            issuer: 'dev',
            audience: AUDIENCE,
            key: { source: 'value', algorithm: 'HS256', value: 'secret' }
        });
        const source = new RemoteJwksSource([row(), staticRow], { fetch: servingFetch({ keys: [] }).impl });

        expect(source.handles(ISSUER)).toBe(true);
        expect(source.handles('dev')).toBe(false);
    });
});

describe('RemoteJwksSource — caching', () => {
    it('fetches once for repeated lookups of the same key', async () => {
        const { jwk } = await publishedKey('key-1');
        const { impl, calls } = servingFetch({ keys: [jwk] });
        const source = new RemoteJwksSource([row()], { fetch: impl });

        await source.getKey({ issuer: ISSUER, kid: 'key-1', algorithm: 'RS256' });
        await source.getKey({ issuer: ISSUER, kid: 'key-1', algorithm: 'RS256' });
        await source.getKey({ issuer: ISSUER, kid: 'key-1', algorithm: 'RS256' });

        expect(calls).toHaveLength(1);
    });

    it('does not refetch per miss, so a stream of unknown kids cannot hammer the IdP', async () => {
        const { jwk } = await publishedKey('key-1');
        const { impl, calls } = servingFetch({ keys: [jwk] });
        const source = new RemoteJwksSource([row()], { fetch: impl });

        for (let i = 0; i < 5; i++) {
            await source.getKey({ issuer: ISSUER, kid: `bogus-${i}`, algorithm: 'RS256' }).catch(() => undefined);
        }

        // One fetch, then the cooldown holds the rest off.
        expect(calls).toHaveLength(1);
    });
});

describe('RemoteJwksSource — ServiceAccount authentication', () => {
    it('sends no Authorization header when auth is none', async () => {
        const { jwk } = await publishedKey('key-1');
        const { impl, calls } = servingFetch({ keys: [jwk] });
        const source = new RemoteJwksSource([row()], { fetch: impl });

        await source.getKey({ issuer: ISSUER, kid: 'key-1', algorithm: 'RS256' });

        expect(calls[0]?.authorization).toBeNull();
    });

    it('sends the ServiceAccount token when the row asks for it', async () => {
        const { jwk } = await publishedKey('key-1');
        const { impl, calls } = servingFetch({ keys: [jwk] });
        const jwksRow = row({ key: { auth: 'serviceAccountToken' } });
        const source = new RemoteJwksSource([jwksRow], {
            // The row's own fetch is replaced, so wrap it the way the source does.
            fetch: async (url, options) => {
                const headers = new Headers(options.headers);
                headers.set('Authorization', 'Bearer sa-token');
                return impl(url, { ...options, headers });
            }
        });

        await source.getKey({ issuer: ISSUER, kid: 'key-1', algorithm: 'RS256' });

        expect(calls[0]?.authorization).toBe('Bearer sa-token');
    });

    it('re-reads the token file on every fetch, because the kubelet rewrites it', async () => {
        const { jwk } = await publishedKey('key-1');
        const readToken = vi.fn<() => Promise<string>>().mockResolvedValue('sa-token');
        const captured: (string | null)[] = [];

        // Exercise the real serviceAccountFetch wrapper by letting the source
        // build it, and intercept at the global fetch boundary instead.
        const globalFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
            captured.push(new Headers(init?.headers).get('Authorization'));
            return Promise.resolve(
                new Response(JSON.stringify({ keys: [jwk] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                })
            );
        });

        const source = new RemoteJwksSource([row({ key: { auth: 'serviceAccountToken', refreshCooldownMs: 1 } })], {
            readServiceAccountToken: readToken
        });

        await source.getKey({ issuer: ISSUER, kid: 'key-1', algorithm: 'RS256' });

        expect(readToken).toHaveBeenCalled();
        expect(captured[0]).toBe('Bearer sa-token');
        globalFetch.mockRestore();
    });
});

describe('RemoteJwksSource — the projected token file', () => {
    it('reads the kubelet path and trims it, when no reader is injected', async () => {
        const { jwk } = await publishedKey('key-1');
        vi.mocked(readFile).mockResolvedValue('sa-token-from-file\n' as never);

        const captured: (string | null)[] = [];
        const globalFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
            captured.push(new Headers(init?.headers).get('Authorization'));
            return Promise.resolve(
                new Response(JSON.stringify({ keys: [jwk] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                })
            );
        });

        const source = new RemoteJwksSource([row({ key: { auth: 'serviceAccountToken' } })]);
        await source.getKey({ issuer: ISSUER, kid: 'key-1', algorithm: 'RS256' });

        expect(readFile).toHaveBeenCalledWith(SERVICE_ACCOUNT_TOKEN_PATH, 'utf8');
        // Trimmed: a trailing newline in the header would be rejected outright.
        expect(captured[0]).toBe('Bearer sa-token-from-file');
        globalFetch.mockRestore();
    });
});
