import { describe, expect, it } from 'vitest';
import { jwtVerify, decodeJwt, decodeProtectedHeader } from 'jose';
import { mintTestToken, TEST_SECRET, testSecretBytes } from './mintTestToken.js';

describe('mintTestToken', () => {
    it('mints a token that verifies against the default secret', async () => {
        const token = await mintTestToken();

        const { payload, protectedHeader } = await jwtVerify(token, testSecretBytes(), {
            issuer: 'https://issuer.test/',
            audience: 'test-audience'
        });

        expect(protectedHeader.alg).toBe('HS256');
        expect(payload.sub).toBe('test-subject');
        expect(payload.iat).toEqual(expect.any(Number));
        expect(payload.exp).toEqual(expect.any(Number));
    });

    it('keeps the trailing slash on the issuer, the way Authentik does', async () => {
        const token = await mintTestToken();
        expect(decodeJwt(token).iss).toBe('https://issuer.test/');
    });

    it('carries extra claims through', async () => {
        const token = await mintTestToken({ claims: { roles: ['qr-manager.admin'], preferred_username: 'claude' } });

        const payload = decodeJwt(token);
        expect(payload['roles']).toEqual(['qr-manager.admin']);
        expect(payload['preferred_username']).toBe('claude');
    });

    it('honours overridden issuer, audience and subject', async () => {
        const token = await mintTestToken({
            issuer: 'https://other.test/',
            audience: 'other-audience',
            subject: 'someone-else'
        });

        const payload = decodeJwt(token);
        expect(payload.iss).toBe('https://other.test/');
        expect(payload.aud).toBe('other-audience');
        expect(payload.sub).toBe('someone-else');
    });

    it('mints an already-expired token from a negative span, so expiry can be tested', async () => {
        const token = await mintTestToken({ expiresIn: '-5m' });

        await expect(jwtVerify(token, testSecretBytes())).rejects.toThrow(/exp|expired/i);
    });

    it('signs with a supplied secret, and such a token fails against the default one', async () => {
        const token = await mintTestToken({ secret: 'another-secret-also-not-real-0000' });

        await expect(jwtVerify(token, testSecretBytes())).rejects.toThrow();
        await expect(
            jwtVerify(token, testSecretBytes('another-secret-also-not-real-0000'))
        ).resolves.toBeDefined();
    });

    it('exposes the default secret as bytes', () => {
        expect(testSecretBytes()).toEqual(new TextEncoder().encode(TEST_SECRET));
    });

    it('uses HS256 so a signed round trip needs no key pair', async () => {
        expect(decodeProtectedHeader(await mintTestToken()).alg).toBe('HS256');
    });
});
