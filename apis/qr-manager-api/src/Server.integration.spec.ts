import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import { Platform } from '@tsed/platform-http';
import SuperTest from 'supertest';
import { Server } from './Server.js';
import { SLUG_REGEX } from './constants.js';

/**
 * Layer paths are a mount base plus a controller path, so joining them naively yields
 * `//r/:slug` for anything mounted at `/`. Collapse before matching — a check that
 * silently stops matching is worse than no check.
 */
const registeredPaths = (): string[] =>
    PlatformTest.get<Platform>(Platform)
        .getLayers()
        .map((layer) => `${layer.getBasePath()}${String(layer.path)}`.replace(/\/{2,}/g, '/'));

describe('Server', () => {
    let request: SuperTest.Agent;

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
    });
    afterEach(PlatformTest.reset);

    /**
     * The invariant, not the mount order. A controller mounted at `/` with a single
     * dynamic segment (`@Get('/:slug')`) matches every literal top-level path too —
     * `/health` included — and Express resolves in registration order, so whichever
     * mounts first wins. `RedirectController` used to be exactly that, which made the
     * order of the `mount` array load-bearing.
     *
     * That failure is the kind nobody notices: `/health/live` and `/health/ready` are
     * two segments and keep returning 200, so every probe stays green while the
     * human-facing `/health` quietly becomes a slug lookup.
     *
     * Asserting no root-level catch-all exists at all is strictly stronger than
     * asserting one specific pair is ordered correctly — it fails for any future
     * controller that re-introduces the shape, not just for a reordered mount array.
     */
    it('registers no root-level single-segment catch-all route', () => {
        const catchAllRoutes = registeredPaths().filter((path) => /^\/:[^/]+$/.test(path));

        expect(catchAllRoutes).toEqual([]);
    });

    /**
     * The other half of the same invariant: a slug has to be resolvable somewhere, and
     * that somewhere must be deeper than one segment. `qr.home` prepends `/r` at the
     * gateway, so this path is what a scanned label actually reaches.
     */
    it('serves the slug redirect one segment below the root', () => {
        const slugRoutes = registeredPaths().filter((path) => path.endsWith('/:slug'));

        expect(slugRoutes).toEqual(['/r/:slug']);
        expect(SLUG_REGEX.test('x7k2')).toBe(true);
    });

    it('resolves /health to the health controller, not the slug redirect', async () => {
        const response = await request.get('/health').expect(200);

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('checks');
        expect(response.headers['location']).toBeUndefined();
    });

    /**
     * What used to be a 400 from the slug pattern. Nothing is mounted at the root
     * catch-all any more, so an unprefixed slug is simply not a route.
     */
    it('returns 404 for a slug-shaped path at the root', async () => {
        await request.get('/x7k2').expect(404);
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
