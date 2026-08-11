import type { HealthCheckResult } from '@radoslavirha/health';
import { inject, injectable } from '@tsed/di';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HEALTH_CHECKS } from './HEALTH_CHECKS.js';
import { HealthCheckService } from './HealthCheckService.js';
import { ShutdownState } from './ShutdownState.js';
import { TestServer } from './test/TestServer.js';
import { HealthStatus } from '@radoslavirha/health';

/**
 * Checks are registered once, at module load, and driven by these mutable holders.
 *
 * `injectable()` writes into the process-wide provider registry, which `PlatformTest.reset`
 * does not clear — registering per-test leaks providers into every later test. Registering
 * statically and varying only the *result* keeps the real DI wiring under test while
 * staying isolated.
 */
const critical = { result: { status: HealthStatus.Pass } as HealthCheckResult };
const nonCritical = { result: { status: HealthStatus.Pass } as HealthCheckResult };

injectable(Symbol.for('test:health:mongodb'))
    .type(HEALTH_CHECKS)
    .factory(() => ({ name: 'mongodb', critical: true, check: () => critical.result }))
    .token();

injectable(Symbol.for('test:health:upstream'))
    .type(HEALTH_CHECKS)
    .factory(() => ({ name: 'upstream', critical: false, check: () => nonCritical.result }))
    .token();

// Deliberately NOT tagged with HEALTH_CHECKS: a check registered with a bare provider
// resolves and injects normally while being invisible to injectMany.
injectable(Symbol.for('test:health:untagged'))
    .factory(() => ({ name: 'untagged', critical: true, check: () => ({ status: HealthStatus.Fail }) }))
    .token();

const bootstrap = async (): Promise<SuperTest.Agent> => {
    await PlatformTest.bootstrap(TestServer)();

    return SuperTest(PlatformTest.callback());
};

describe('HealthController', () => {
    let request: SuperTest.Agent;

    beforeEach(async () => {
        // cacheTtlMs defaults to 1000ms; results are swapped between tests, so the
        // registry is rebuilt per bootstrap and never serves a previous test's verdict.
        critical.result = { status: HealthStatus.Pass };
        nonCritical.result = { status: HealthStatus.Pass };
        request = await bootstrap();
    });

    afterEach(() => PlatformTest.reset());

    describe('GET /health/live', () => {
        it('Should return 200 when everything is healthy', async () => {
            const response = await request.get('/health/live').expect(200);

            expect(response.body).toEqual({ status: HealthStatus.Pass });
        });

        /**
         * The single most important assertion in this suite. Liveness must not consult
         * dependencies — otherwise a Mongo blip restarts every replica of every service
         * at once, they all reconnect together, and the health check becomes the outage.
         */
        it('Should return 200 even when a critical check is failing', async () => {
            critical.result = { status: HealthStatus.Fail, detail: 'disconnected' };

            const response = await request.get('/health/live').expect(200);

            expect(response.body).toEqual({ status: HealthStatus.Pass });
        });

        // A draining pod is not a stuck pod; failing liveness here earns a pointless restart.
        it('Should return 200 while draining', async () => {
            inject<ShutdownState>(ShutdownState).beginDrain();

            await request.get('/health/live').expect(200);
        });

        it('Should serve the health+json content type', async () => {
            const response = await request.get('/health/live').expect(200);

            expect(response.headers['content-type']).toContain('application/health+json');
        });
    });

    describe('GET /health/ready', () => {
        it('Should return 200 when everything is healthy', async () => {
            const response = await request.get('/health/ready').expect(200);

            expect(response.body).toEqual({ status: HealthStatus.Pass });
        });

        it('Should return 503 when a critical check fails', async () => {
            critical.result = { status: HealthStatus.Fail, detail: 'disconnected' };

            const response = await request.get('/health/ready').expect(503);

            expect(response.body).toEqual({ status: HealthStatus.Fail });
        });

        // An outage you cannot fix must not remove your own pods from Endpoints.
        it('Should return 200 when only a non-critical check fails', async () => {
            nonCritical.result = { status: HealthStatus.Fail, detail: 'circuit-open' };

            const response = await request.get('/health/ready').expect(200);

            expect(response.body).toEqual({ status: HealthStatus.Warn });
        });

        it('Should return 503 while draining', async () => {
            inject<ShutdownState>(ShutdownState).beginDrain();

            const response = await request.get('/health/ready').expect(503);

            expect(response.body).toEqual({ status: HealthStatus.Fail });
        });

        // kubelet needs the status and nothing else; /health exists for the rest.
        it('Should omit the checks breakdown', async () => {
            const response = await request.get('/health/ready').expect(200);

            expect(response.body).not.toHaveProperty('checks');
        });
    });

    describe('GET /health', () => {
        it('Should return the full breakdown', async () => {
            nonCritical.result = { status: HealthStatus.Fail, detail: 'circuit-open' };

            const response = await request.get('/health').expect(200);

            expect(response.body).toEqual({
                status: HealthStatus.Warn,
                checks: {
                    mongodb: { status: HealthStatus.Pass },
                    upstream: { status: HealthStatus.Fail, detail: 'circuit-open' }
                }
            });
        });

        // warn answering 200 is the point: degraded must be visible without kubelet acting.
        it('Should return 200 for warn', async () => {
            nonCritical.result = { status: HealthStatus.Warn };

            await request.get('/health').expect(200);
        });

        it('Should return 503 for fail', async () => {
            critical.result = { status: HealthStatus.Fail };

            await request.get('/health').expect(503);
        });

        it('Should return 503 while draining', async () => {
            inject<ShutdownState>(ShutdownState).beginDrain();

            await request.get('/health').expect(503);
        });
    });

    describe('Registration', () => {
        it('Should collect only providers tagged with HEALTH_CHECKS', async () => {
            const response = await request.get('/health').expect(200);

            expect(Object.keys(response.body.checks).sort()).toEqual(['mongodb', 'upstream']);
            expect(response.body.checks).not.toHaveProperty('untagged');
        });

        it('Should expose the registered checks through the service', () => {
            const names = inject<HealthCheckService>(HealthCheckService).checks().map((c) => c.name);

            expect(names.sort()).toEqual(['mongodb', 'upstream']);
        });
    });
});
