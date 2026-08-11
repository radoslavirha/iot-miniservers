import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { Server } from './Server.js';

describe('Server', () => {
    let request: SuperTest.Agent;

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
    });
    afterEach(PlatformTest.reset);

    /**
     * `RedirectController` is `@Controller('/')` with `@Get('/:slug')`, so it matches any
     * single-segment path — `/health` included. Express resolves in mount-array order, so
     * `HealthController` must be registered before it.
     *
     * This is the failure that would otherwise go unnoticed: `/health/live` and
     * `/health/ready` are two segments and keep working, so every probe stays green while
     * the human-facing `/health` quietly becomes a slug lookup.
     *
     * Only this direction needs a test — `/health` is a literal path, so it can shadow the
     * exact string `health` and nothing else. Other slugs are unaffected by mount order.
     */
    it('resolves /health to the health controller, not the slug redirect', async () => {
        const response = await request.get('/health').expect(200);

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('checks');
        expect(response.headers['location']).toBeUndefined();
    });

    it('returns 404 for an unknown multi-segment path', async () => {
        const response = await request.get('/missing/path').expect(404);
        expect(response.body).toEqual({
            errors: [],
            message: 'Resource "/missing/path" not found',
            name: 'NOT_FOUND',
            status: 404
        });
    });
});
