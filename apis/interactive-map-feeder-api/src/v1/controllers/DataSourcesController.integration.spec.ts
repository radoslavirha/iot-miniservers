import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { mintTestToken } from '@radoslavirha/tsed-auth';
import { Server } from '../../Server.js';

/**
 * Two trust domains, and the asymmetry between them.
 *
 * Every route reads public ČHMÚ data, so nothing here is protecting a secret.
 * What the split protects is the *other* direction: the LaskaKit map holds a
 * long-lived credential in flash and calls this API over plain HTTP on the LAN,
 * so its token is the one most likely to leak — and it must reach exactly one
 * route, not the whole surface. These tests are what makes that true rather
 * than intended.
 */
describe('DataSourcesController (integration)', () => {
    let request: SuperTest.Agent;

    /** `config/test.json` — the IDP entry. */
    const personToken = () => mintTestToken();
    /** `config/test.json` — the DEVICE entry: different issuer, different secret. */
    const deviceToken = () => mintTestToken({
        secret: 'test-device-secret-not-a-real-000',
        issuer: 'https://device.issuer.test/',
        audience: 'test-device-audience'
    });

    const IOT = '/v1/data-sources/radar/cities/iot';
    const PERSON_ROUTES = [
        '/v1/data-sources/list',
        '/v1/data-sources/radar/cities',
        '/v1/data-sources/radar/image'
    ];

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest.agent(PlatformTest.callback());
    });
    afterEach(PlatformTest.reset);

    describe('routes a person uses', () => {
        it.each(PERSON_ROUTES)('refuses %s with no credential', async (path) => {
            await request.get(path).expect(401);
        });

        it.each(PERSON_ROUTES)('does not answer 401 on %s for a person', async (path) => {
            // Not asserting success: past the guard these reach ČHMÚ, which a
            // test has no business calling. What matters is that authentication
            // stopped being the reason for the refusal.
            const response = await request.get(path).set('Authorization', `Bearer ${await personToken()}`);

            expect(response.status).not.toBe(401);
        });

        it.each(PERSON_ROUTES)('refuses the device token on %s', async (path) => {
            // The whole point of two trust domains. A leaked device credential
            // reaches its one route and nothing else.
            const response = await request.get(path).set('Authorization', `Bearer ${await deviceToken()}`);

            expect(response.status).toBe(401);
        });
    });

    describe('the route the map polls', () => {
        it('refuses a caller with no credential', async () => {
            await request.get(IOT).expect(401);
        });

        it('does not answer 401 for the device token', async () => {
            const response = await request.get(IOT).set('Authorization', `Bearer ${await deviceToken()}`);

            expect(response.status).not.toBe(401);
        });

        it('refuses a person token, because the method is overridden not inherited', async () => {
            // If a method-level `@Authenticate` ever started *adding* to the
            // class-level one instead of replacing it, this route would accept
            // IDP and the map would break in the field. This is the test that
            // notices.
            const response = await request.get(IOT).set('Authorization', `Bearer ${await personToken()}`);

            expect(response.status).toBe(401);
        });
    });

    describe('the refusals that separate a token from a token for us', () => {
        it('refuses a device token signed by somebody else', async () => {
            const forged = await mintTestToken({
                secret: 'a-different-secret-0000000000000',
                issuer: 'https://device.issuer.test/',
                audience: 'test-device-audience'
            });

            await request.get(IOT).set('Authorization', `Bearer ${forged}`).expect(401);
        });

        it('refuses a device token minted for another audience', async () => {
            const elsewhere = await mintTestToken({
                secret: 'test-device-secret-not-a-real-000',
                issuer: 'https://device.issuer.test/',
                audience: 'some-other-api'
            });

            await request.get(IOT).set('Authorization', `Bearer ${elsewhere}`).expect(401);
        });

        it('refuses an expired device token', async () => {
            const stale = await mintTestToken({
                secret: 'test-device-secret-not-a-real-000',
                issuer: 'https://device.issuer.test/',
                audience: 'test-device-audience',
                expiresIn: '-5m'
            });

            await request.get(IOT).set('Authorization', `Bearer ${stale}`).expect(401);
        });

        it('ignores a non-bearer scheme rather than treating it as a bad token', async () => {
            await request.get(IOT).set('Authorization', 'Basic dXNlcjpwYXNz').expect(401);
        });

        it('leaks nothing about why the credential was refused', async () => {
            const elsewhere = await mintTestToken({
                secret: 'test-device-secret-not-a-real-000',
                issuer: 'https://device.issuer.test/',
                audience: 'some-other-api'
            });
            const response = await request.get(IOT).set('Authorization', `Bearer ${elsewhere}`);

            expect(JSON.stringify(response.body)).not.toContain('some-other-api');
        });
    });
});
