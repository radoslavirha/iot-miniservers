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
