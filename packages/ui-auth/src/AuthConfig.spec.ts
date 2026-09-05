import { describe, expect, it } from 'vitest';
import { AuthConfigSchema } from './AuthConfig.js';

const valid = {
    issuer: 'https://auth.irha.cz/application/o/qr-manager-server1-sandbox/',
    clientId: 'qr-manager-server1-sandbox',
    scope: 'openid profile email roles',
    redirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/callback',
    postLogoutRedirectUri: 'https://apps.sandbox.server1.homelab.irha.cz/qr-manager/'
};

describe('AuthConfigSchema', () => {
    it('accepts a complete block', () => {
        expect(AuthConfigSchema.parse(valid)).toEqual(valid);
    });

    it('keeps the trailing slash on the issuer', () => {
        // The issuer IS the trailing-slash form; stripping it breaks the iss comparison.
        expect(AuthConfigSchema.parse(valid).issuer.endsWith('/')).toBe(true);
    });

    it('rejects a scope missing the roles scope', () => {
        // Without `roles` the API denies everything and the reason is invisible.
        expect(() => AuthConfigSchema.parse({ ...valid, scope: 'openid profile email' })).toThrow();
    });

    it('rejects a scope missing the profile scope', () => {
        // Without `profile` the aud claim comes back a bare string instead of an array.
        expect(() => AuthConfigSchema.parse({ ...valid, scope: 'openid email roles' })).toThrow();
    });

    it('rejects a non-http issuer', () => {
        expect(() => AuthConfigSchema.parse({ ...valid, issuer: 'auth.irha.cz' })).toThrow();
    });

    it('rejects an empty clientId', () => {
        expect(() => AuthConfigSchema.parse({ ...valid, clientId: '' })).toThrow();
    });
});
