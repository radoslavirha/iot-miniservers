import { describe, expect, it } from 'vitest';
import {
    AuthConfigSchema,
    AuthConfigurationError,
    TEST_METHOD,
    VerifierType,
    mintTestToken,
    TEST_SECRET
} from '@radoslavirha/auth';
import { AuthenticationService } from './AuthenticationService.js';

const ISSUER = 'dev';
const AUDIENCE = 'qr-manager-api';

const localhostConfig = AuthConfigSchema.parse({
    [TEST_METHOD]: {
        type: VerifierType.BearerJwt,
        trustedIssuers: [{
            name: 'dev-local',
            issuer: ISSUER,
            audience: AUDIENCE,
            subjectKind: 'service',
            key: { source: 'value', algorithm: 'HS256', value: TEST_SECRET }
        }]
    }
});

const serviceFor = () => new AuthenticationService(localhostConfig);

/**
 * The service is `Authenticator` plus two Ts.ED decorators — the decision logic
 * has its own spec in `@radoslavirha/auth`. What is worth pinning here is that
 * the subclass still works end to end when a container hands it nothing but a
 * parsed config: a real token, really signed, really verified, nothing running.
 */
describe('AuthenticationService', () => {
    it('verifies a real token from configuration alone', async () => {
        const decision = await serviceFor().authenticate(
            await mintTestToken({ issuer: ISSUER, audience: AUDIENCE, subject: 'a-service' }),
            TEST_METHOD
        );

        expect(decision).toMatchObject({ allowed: true, reason: 'ok' });
        expect(decision).toHaveProperty('principal.subject', 'a-service');
        expect(decision).toHaveProperty('principal.kind', 'service');
    });

    it('refuses a token minted for another audience', async () => {
        const decision = await serviceFor().authenticate(
            await mintTestToken({ issuer: ISSUER, audience: 'somebody-else', subject: 's' }),
            TEST_METHOD
        );

        expect(decision).toMatchObject({ allowed: false, reason: 'wrong-audience', status: 401 });
    });

    it('refuses a token from an issuer it does not trust', async () => {
        const decision = await serviceFor().authenticate(
            await mintTestToken({ issuer: 'https://elsewhere.test/', audience: AUDIENCE, subject: 's' }),
            TEST_METHOD
        );

        expect(decision).toMatchObject({ allowed: false, reason: 'unknown-issuer' });
    });

    it('refuses a token signed with the wrong secret', async () => {
        const decision = await serviceFor().authenticate(
            await mintTestToken({ issuer: ISSUER, audience: AUDIENCE, secret: 'a-different-secret-00000000000000' }),
            TEST_METHOD
        );

        expect(decision).toMatchObject({ allowed: false, reason: 'invalid' });
    });

    it('fails loudly when a route asks for a method nothing is configured for', async () => {
        // A deployment or programmer error, not a caller's. Configuring with
        // `createAuthConfigSchema` moves this to boot; reaching it at runtime
        // still must not look like a bad token.
        await expect(serviceFor().authenticate('t', 'DEVICES')).rejects.toBeInstanceOf(
            AuthConfigurationError
        );
    });
});
