import { describe, expect, it } from 'vitest';
import { RuntimeConfigSchema } from './RuntimeConfig.js';

/**
 * The `auth` block is REQUIRED, so every config that is expected to parse has
 * to carry it. That is why it is threaded through the cases below rather than
 * appearing only in its own describe.
 */
const auth = {
    issuer: 'https://auth.irha.cz/application/o/qr-manager-server1-sandbox/',
    clientId: 'qr-manager-server1-sandbox',
    scope: 'openid profile email roles',
    redirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/callback',
    postLogoutRedirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/'
};

describe('RuntimeConfigSchema', () => {
    it('accepts a minimal config and defaults basePath', () => {
        const result = RuntimeConfigSchema.parse({ apiBaseURL: 'https://api.server.home/qr', auth });

        expect(result).toEqual({ apiBaseURL: 'https://api.server.home/qr', basePath: '/', auth });
    });

    it('strips trailing slashes from apiBaseURL so paths do not double up', () => {
        const result = RuntimeConfigSchema.parse({ apiBaseURL: 'https://api.server.home/qr///', auth });

        expect(result.apiBaseURL).toBe('https://api.server.home/qr');
    });

    it('keeps an explicit basePath', () => {
        const result = RuntimeConfigSchema.parse({
            apiBaseURL: 'https://api.server.home/qr',
            basePath: '/qr-manager',
            auth
        });

        expect(result.basePath).toBe('/qr-manager');
    });

    it.each([
        ['absent', {}],
        ['empty — the empty-Jinja2-substitution case', { apiBaseURL: '', auth }],
        ['not a URL', { apiBaseURL: 'nope', auth }],
        ['scheme-less, which plain z.url() would accept', { apiBaseURL: 'localhost:4002', auth }],
        ['a non-http scheme', { apiBaseURL: 'ftp://api.server.home', auth }]
    ])('rejects apiBaseURL %s', (_name, input) => {
        expect(RuntimeConfigSchema.safeParse(input).success).toBe(false);
    });

    it('rejects a basePath that is not absolute', () => {
        const result = RuntimeConfigSchema.safeParse({
            apiBaseURL: 'https://api.server.home/qr',
            basePath: 'qr-manager',
            auth
        });

        expect(result.success).toBe(false);
    });

    describe('auth block', () => {
        it('is required — a config without it is rejected', () => {
            // Deliberate break with the usual "every new key is optional" rule:
            // a UI that renders without auth is a UI nobody notices is unprotected.
            expect(() => RuntimeConfigSchema.parse({ apiBaseURL: 'http://localhost:4002' })).toThrow();
        });

        it('accepts a complete config', () => {
            const parsed = RuntimeConfigSchema.parse({ apiBaseURL: 'http://localhost:4002', auth });
            expect(parsed.auth.clientId).toBe('qr-manager-server1-sandbox');
        });
    });
});
