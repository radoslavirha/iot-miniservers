import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { mintTestToken } from '@radoslavirha/tsed-auth';
import { Server } from '../../Server.js';

/**
 * One trust domain, two issuers.
 *
 * The LaskaKit map logs in against the same identity provider as a person does,
 * from its own Authentik application — so its token is an ordinary bearer JWT
 * from a neighbouring issuer, and this API treats it as such. The tests below
 * assert that both issuers are accepted and that everything else is refused:
 * no credential, a forged signature, an audience minted for somebody else, and
 * a scheme that is not `Bearer`.
 *
 * There used to be a second trust domain here so the map's route could refuse a
 * person's token. That put the decision in the wrong place — which caller may do
 * what is `roles` on the `Principal`, not a trust domain — and it is gone.
 */
describe('DataSourcesController (integration)', () => {
    let request: SuperTest.Agent;

    /** `config/test.json` — the first issuer of the IDP entry. */
    const personToken = () => mintTestToken();
    /** The second issuer of the same entry: the map's own application. */
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

        it.each(PERSON_ROUTES)('admits the map on %s too, because it is the same trust domain', async (path) => {
            // Deliberate, and a change from the original design. Restricting the
            // map to one route is authorization; when it is wanted it belongs to
            // @RequireRoles and a role its service account holds, so that adding
            // a second device needs no change in this repo.
            const response = await request.get(path).set('Authorization', `Bearer ${await deviceToken()}`);

            expect(response.status).not.toBe(401);
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

        it('admits a person token as well', async () => {
            // The route is guarded, not restricted. Both issuers of the single
            // trust domain reach it, and the route reads public radar data.
            const response = await request.get(IOT).set('Authorization', `Bearer ${await personToken()}`);

            expect(response.status).not.toBe(401);
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
