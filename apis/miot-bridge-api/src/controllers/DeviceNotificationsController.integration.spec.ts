import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { authenticateBearerJwt, mintTestToken } from '@radoslavirha/tsed-auth';
import { Server } from '../Server.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';

/**
 * A **child** controller of `DevicesController`, and the reason this file exists
 * separately rather than being folded into the parent's.
 *
 * Ts.ED's `UseAuth` decorates the methods of the class it sits on, and a child
 * controller is a separate class — it inherits the parent's path prefix and
 * nothing else. Without its own `@Authenticate` these four routes would have
 * shipped open beside every closed route around them, which is precisely the
 * failure a per-controller test catches and a per-service one does not.
 */
describe('DeviceNotificationsController (integration)', () => {
    let request: SuperTest.Agent;
    let api: SuperTest.Agent;

    beforeEach(PlatformTest.bootstrap(Server, {
        imports: [{ token: MqttClientProvider, use: null }]
    }));
    beforeEach(async () => {
        request = SuperTest.agent(PlatformTest.callback());
        // A second agent carrying a valid token as a default header. Two agents
        // rather than one, because `agent.set` is sticky — an authenticated
        // agent cannot also serve the anonymous cases.
        api = await authenticateBearerJwt(SuperTest.agent(PlatformTest.callback()));
    });
    afterEach(PlatformTest.reset);

    describe('Authentication', () => {
        const routes: ReadonlyArray<readonly [string, string]> = [
            ['post', '/devices/671b00000000000000000001/notifications'],
            ['get', '/devices/671b00000000000000000001/notifications'],
            ['delete', '/devices/671b00000000000000000001/notifications'],
            ['delete', '/devices/671b00000000000000000001/notifications/n1']
        ];

        describe.each(routes)('%s %s', (method, path) => {
            const call = (agent: SuperTest.Agent) => agent[method as 'get'](path);

            it('refuses a caller with no credential', async () => {
                await call(request).expect(401);
            });

            it('refuses a token signed by somebody else', async () => {
                const forged = await mintTestToken({ secret: 'a-different-secret-0000000000000' });

                await call(request).set('Authorization', `Bearer ${forged}`).expect(401);
            });

            it('does not answer 401 for a valid token', async () => {
                // Deliberately not asserting a success status. Past the guard these
                // routes want a body, a real device, or storage a bare test config
                // does not have — what matters is that authentication stopped being
                // the reason for the refusal.
                const response = await call(api);

                expect(response.status).not.toBe(401);
            });
        });

        describe('the refusals that separate a token from a token for us', () => {
            const probe = () => request.get('/devices/671b00000000000000000001/notifications');

            it('refuses a valid token minted for another audience', async () => {
                const elsewhere = await mintTestToken({ audience: 'some-other-api' });

                await probe().set('Authorization', `Bearer ${elsewhere}`).expect(401);
            });

            it('refuses a valid token from another issuer', async () => {
                const elsewhere = await mintTestToken({ issuer: 'https://not-our-idp.test/' });

                await probe().set('Authorization', `Bearer ${elsewhere}`).expect(401);
            });

            it('refuses an expired token', async () => {
                const stale = await mintTestToken({ expiresIn: '-5m' });

                await probe().set('Authorization', `Bearer ${stale}`).expect(401);
            });

            it('ignores a non-bearer scheme rather than treating it as a bad token', async () => {
                await probe().set('Authorization', 'Basic dXNlcjpwYXNz').expect(401);
            });

            it('leaks nothing about why the credential was refused', async () => {
                // The operator-facing detail names the audience that did not match.
                // Handing it back tells an attacker which part to fix next.
                const elsewhere = await mintTestToken({ audience: 'some-other-api' });
                const response = await probe().set('Authorization', `Bearer ${elsewhere}`);

                expect(JSON.stringify(response.body)).not.toContain('some-other-api');
            });
        });
    });
});
