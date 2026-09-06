import { describe, expect, it } from 'vitest';
import { generateKeyPair, exportSPKI } from 'jose';
import { StaticAlgorithmMismatchError, StaticKeySource, UnknownStaticIssuerError } from './StaticKeySource.js';
import { TrustedIssuerSchema } from '../schemas/auth.schema.js';
import { TEST_SECRET } from '../test/mintTestToken.js';

const row = (overrides: Record<string, unknown> = {}) =>
    TrustedIssuerSchema.parse({
        name: 'dev-local',
        issuer: 'https://issuer.test/',
        audience: 'test-audience',
        key: { source: 'value', algorithm: 'HS256', value: TEST_SECRET },
        ...overrides
    });

describe('StaticKeySource', () => {
    it('returns the secret bytes for an HS256 row', async () => {
        const source = new StaticKeySource([row()]);

        const key = await source.getKey({ issuer: 'https://issuer.test/' });

        expect(key).toEqual(new TextEncoder().encode(TEST_SECRET));
    });

    it('imports a PEM public key for an asymmetric row', async () => {
        const { publicKey } = await generateKeyPair('RS256');
        const source = new StaticKeySource([
            row({ key: { source: 'value', algorithm: 'RS256', value: await exportSPKI(publicKey) } })
        ]);

        const key = await source.getKey({ issuer: 'https://issuer.test/', algorithm: 'RS256' });

        expect(key).toHaveProperty('type', 'public');
    });

    it('imports a PEM once and reuses it', async () => {
        const { publicKey } = await generateKeyPair('RS256');
        const source = new StaticKeySource([
            row({ key: { source: 'value', algorithm: 'RS256', value: await exportSPKI(publicKey) } })
        ]);

        const first = await source.getKey({ issuer: 'https://issuer.test/' });
        const second = await source.getKey({ issuer: 'https://issuer.test/' });

        expect(second).toBe(first);
    });

    it('throws UnknownStaticIssuerError for an issuer it has no key for', async () => {
        const source = new StaticKeySource([row()]);

        await expect(source.getKey({ issuer: 'https://elsewhere.test/' })).rejects.toBeInstanceOf(
            UnknownStaticIssuerError
        );
    });

    it('refuses an algorithm the row is not configured for', async () => {
        const source = new StaticKeySource([row()]);

        await expect(
            source.getKey({ issuer: 'https://issuer.test/', algorithm: 'RS256' })
        ).rejects.toBeInstanceOf(StaticAlgorithmMismatchError);
    });

    it('ignores kid, because a static row holds exactly one key', async () => {
        const source = new StaticKeySource([row()]);

        await expect(
            source.getKey({ issuer: 'https://issuer.test/', kid: 'whatever' })
        ).resolves.toEqual(new TextEncoder().encode(TEST_SECRET));
    });

    it('keeps only inline-key rows, so a mixed configuration can be handed to it whole', async () => {
        const jwksRow = row({
            name: 'idp',
            issuer: 'https://idp.test/',
            key: { source: 'jwks', uri: 'https://idp.test/jwks' }
        });
        const source = new StaticKeySource([row(), jwksRow]);

        expect(source.handles('https://issuer.test/')).toBe(true);
        expect(source.handles('https://idp.test/')).toBe(false);
        await expect(source.getKey({ issuer: 'https://idp.test/' })).rejects.toBeInstanceOf(UnknownStaticIssuerError);
    });
});
