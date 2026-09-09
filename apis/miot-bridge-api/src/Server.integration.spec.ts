import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { Server } from './Server.js';
import { MqttClientProvider } from './providers/MqttClientProvider.js';

describe('Server', () => {
    let request: SuperTest.Agent;

    beforeEach(PlatformTest.bootstrap(Server, {
        imports: [{ token: MqttClientProvider, use: null }]
    }));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
    });
    afterEach(PlatformTest.reset);

    // Every controller in this service is guarded, so these are the only routes
    // left that answer without a credential. Asserted here rather than in a
    // controller spec because keeping them open is a property of the service.
    it.each(['/health', '/health/live', '/health/ready'])('Should serve %s with no credential', async (path) => {
        const response = await request.get(path);

        expect(response.status).not.toBe(401);
    });

    it('Should call GET /rest', async () => {
        const response = await request.get('/rest').expect(404);

        expect(response.body).toEqual({
            errors: [],
            message: 'Resource "/rest" not found',
            name: 'NOT_FOUND',
            status: 404
        });
    });
});
