import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthStrategy } from '../schemas/auth.schema.js';
import type { JwtSelfSignedAuth } from '../schemas/auth.schema.js';
import { JwtSelfSignedStrategy } from './JwtSelfSignedStrategy.js';

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn()
}));

vi.mock('jose', () => {
    const mockInstance = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setIssuer: vi.fn().mockReturnThis(),
        setSubject: vi.fn().mockReturnThis(),
        setAudience: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue('mock-jwt-token')
    };
    return {
        SignJWT: vi.fn().mockImplementation(function () {
            return mockInstance; 
        }),
        importPKCS8: vi.fn().mockResolvedValue('mock-crypto-key')
    };
});

import { readFile } from 'node:fs/promises';
import { importPKCS8, SignJWT } from 'jose';

const RS256_FILE_CONFIG: JwtSelfSignedAuth = {
    strategy: AuthStrategy.JwtSelfSigned,
    key: { source: 'file', path: '/run/secrets/private.key' },
    algorithm: 'RS256',
    claims: { iss: 'miot-bridge', sub: 'miot-bridge', aud: 'qr-manager', exp: 3600 },
    transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
};

const HS256_VALUE_CONFIG: JwtSelfSignedAuth = {
    strategy: AuthStrategy.JwtSelfSigned,
    key: { source: 'value', value: 'shared-secret' },
    algorithm: 'HS256',
    claims: { exp: 60 },
    transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
};

describe('JwtSelfSignedStrategy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('generates a JWT and returns it as "value" credential', async () => {
        vi.mocked(readFile).mockResolvedValue('-----BEGIN PRIVATE KEY-----' as never);
        const strategy = new JwtSelfSignedStrategy(RS256_FILE_CONFIG);
        const creds = await strategy.getCredentials();
        expect(creds).toEqual({ value: 'mock-jwt-token' });
    });

    it('reads private key from file for RS256', async () => {
        vi.mocked(readFile).mockResolvedValue('-----BEGIN PRIVATE KEY-----' as never);
        const strategy = new JwtSelfSignedStrategy(RS256_FILE_CONFIG);
        await strategy.getCredentials();
        expect(readFile).toHaveBeenCalledWith('/run/secrets/private.key', 'utf-8');
        expect(importPKCS8).toHaveBeenCalledWith('-----BEGIN PRIVATE KEY-----', 'RS256');
    });

    it('uses inline key value for HS256 without reading a file', async () => {
        const strategy = new JwtSelfSignedStrategy(HS256_VALUE_CONFIG);
        await strategy.getCredentials();
        expect(readFile).not.toHaveBeenCalled();
        expect(importPKCS8).not.toHaveBeenCalled();
    });

    it('caches the token on second call', async () => {
        vi.mocked(readFile).mockResolvedValue('key' as never);
        const strategy = new JwtSelfSignedStrategy(RS256_FILE_CONFIG);
        await strategy.getCredentials();
        await strategy.getCredentials();
        expect(vi.mocked(SignJWT)).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent cold token generation for file keys', async () => {
        let releaseReadFile!: (value: string) => void;
        const pendingRead = new Promise<string>((resolve) => {
            releaseReadFile = resolve;
        });
        vi.mocked(readFile).mockImplementation(() => pendingRead as never);

        const strategy = new JwtSelfSignedStrategy(RS256_FILE_CONFIG);
        const firstPending = strategy.getCredentials();
        const secondPending = strategy.getCredentials();

        await Promise.resolve();
        releaseReadFile('-----BEGIN PRIVATE KEY-----');

        const [first, second] = await Promise.all([firstPending, secondPending]);

        expect(first).toEqual({ value: 'mock-jwt-token' });
        expect(second).toEqual(first);
        expect(readFile).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh token generation after invalidate while an older generation is in flight', async () => {
        let releaseFirstRead!: (value: string) => void;
        const firstReadPending = new Promise<string>((resolve) => {
            releaseFirstRead = resolve;
        });
        let readCount = 0;

        vi.mocked(readFile).mockImplementation(() => {
            readCount += 1;
            if (readCount === 1) {
                return firstReadPending as never;
            }
            return Promise.resolve('-----BEGIN PRIVATE KEY-----') as never;
        });

        const strategy = new JwtSelfSignedStrategy(RS256_FILE_CONFIG);

        const firstPending = strategy.getCredentials();
        await Promise.resolve();
        strategy.invalidate();

        const second = await strategy.getCredentials();
        expect(second).toEqual({ value: 'mock-jwt-token' });

        releaseFirstRead('-----BEGIN PRIVATE KEY-----');
        await firstPending;

        const third = await strategy.getCredentials();
        expect(third).toEqual({ value: 'mock-jwt-token' });
        expect(readFile).toHaveBeenCalledTimes(2);
    });

    it('re-generates after invalidate()', async () => {
        vi.mocked(readFile).mockResolvedValue('key' as never);
        const strategy = new JwtSelfSignedStrategy(RS256_FILE_CONFIG);
        await strategy.getCredentials();
        strategy.invalidate();
        await strategy.getCredentials();
        expect(vi.mocked(SignJWT)).toHaveBeenCalledTimes(2);
    });

    it('sets issuer, subject, audience on the JWT when provided', async () => {
        vi.mocked(readFile).mockResolvedValue('key' as never);
        const strategy = new JwtSelfSignedStrategy(RS256_FILE_CONFIG);
        await strategy.getCredentials();
        const instance = vi.mocked(SignJWT).mock.results[0]?.value as InstanceType<typeof SignJWT>;
        expect(instance.setIssuer).toHaveBeenCalledWith('miot-bridge');
        expect(instance.setSubject).toHaveBeenCalledWith('miot-bridge');
        expect(instance.setAudience).toHaveBeenCalledWith('qr-manager');
    });

    it('sets expiration time on the JWT', async () => {
        vi.mocked(readFile).mockResolvedValue('key' as never);
        const strategy = new JwtSelfSignedStrategy(RS256_FILE_CONFIG);
        await strategy.getCredentials();
        const instance = vi.mocked(SignJWT).mock.results[0]?.value as InstanceType<typeof SignJWT>;
        expect(instance.setExpirationTime).toHaveBeenCalledWith('3600s');
    });

    it('re-generates when token is within the expiry buffer', async () => {
        vi.mocked(readFile).mockResolvedValue('key' as never);
        const baseSeconds = 1_000_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(baseSeconds * 1000);

        const strategy = new JwtSelfSignedStrategy({ ...RS256_FILE_CONFIG, claims: { exp: 60 } });
        await strategy.getCredentials(); // expiresAt = baseSeconds + 60
        expect(vi.mocked(SignJWT)).toHaveBeenCalledTimes(1);

        // Advance time into the 30-second buffer (31 seconds later)
        vi.spyOn(Date, 'now').mockReturnValue((baseSeconds + 31) * 1000);
        await strategy.getCredentials(); // isExpired === true → re-generate
        expect(vi.mocked(SignJWT)).toHaveBeenCalledTimes(2);

        vi.restoreAllMocks();
    });

    it('throws for an unsupported JWT algorithm', async () => {
        vi.mocked(readFile).mockResolvedValue('key' as never);
        const badConfig = {
            ...RS256_FILE_CONFIG,
            algorithm: 'RS512'
        } as unknown as typeof RS256_FILE_CONFIG;
        const strategy = new JwtSelfSignedStrategy(badConfig);
        await expect(strategy.getCredentials()).rejects.toThrow('Unsupported JWT algorithm: RS512');
    });
});
