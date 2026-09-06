import { describe, expect, it } from 'vitest';
import { AuthConfigSchema, mintTestToken, TEST_SECRET } from '@radoslavirha/auth';
import { AuthenticationService } from './AuthenticationService.js';

const ISSUER = 'dev';
const AUDIENCE = 'qr-manager-api';

const localhostConfig = AuthConfigSchema.parse({
    mode: 'enforced',
    trustedIssuers: [{
        name: 'dev-local',
        issuer: ISSUER,
        audience: AUDIENCE,
        subjectKind: 'service',
        key: { source: 'value', algorithm: 'HS256', value: TEST_SECRET }
    }]
});

describe('AuthenticationService', () => {
    it('builds a working verifier when none is injected', async () => {
        // The end-to-end wiring, and the reason `config/localhost.json` is an
        // issuer row rather than a bypass: a real token, really signed, really
        // verified, with nothing running.
        const service = new AuthenticationService(localhostConfig);

        const decision = await service.authenticate(
            await mintTestToken({ issuer: ISSUER, audience: AUDIENCE, subject: 'a-service' })
        );

        expect(decision).toMatchObject({ allowed: true, reason: 'ok' });
        expect(decision).toHaveProperty('principal.subject', 'a-service');
        expect(decision).toHaveProperty('principal.kind', 'service');
    });

    it('refuses a token minted for another audience', async () => {
        const service = new AuthenticationService(localhostConfig);

        const decision = await service.authenticate(
            await mintTestToken({ issuer: ISSUER, audience: 'somebody-else', subject: 's' })
        );

        expect(decision).toMatchObject({ allowed: false, reason: 'wrong-audience', status: 401 });
    });

    it('refuses a token from an issuer it does not trust', async () => {
        const service = new AuthenticationService(localhostConfig);

        const decision = await service.authenticate(
            await mintTestToken({ issuer: 'https://elsewhere.test/', audience: AUDIENCE, subject: 's' })
        );

        expect(decision).toMatchObject({ allowed: false, reason: 'unknown-issuer' });
    });

    it('refuses a token signed with the wrong secret', async () => {
        const service = new AuthenticationService(localhostConfig);

        const decision = await service.authenticate(
            await mintTestToken({ issuer: ISSUER, audience: AUDIENCE, secret: 'a-different-secret-00000000000000' })
        );

        expect(decision).toMatchObject({ allowed: false, reason: 'invalid' });
    });

    it('exposes the configured mode', () => {
        expect(new AuthenticationService(localhostConfig).mode).toBe('enforced');
    });
});
