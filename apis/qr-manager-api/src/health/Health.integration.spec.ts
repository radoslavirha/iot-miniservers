import { HealthCheckService } from '@radoslavirha/tsed-health';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoHealthCheck } from '@radoslavirha/tsed-health/mongoose';
import { Server } from '../Server.js';
import { HealthStatus } from '@radoslavirha/tsed-health';

describe('Health endpoints (integration)', () => {
    let request: SuperTest.Agent;
    let mongoCheck: MongoHealthCheck;

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
        mongoCheck = PlatformTest.get<MongoHealthCheck>(MongoHealthCheck);
    });
    afterEach(PlatformTest.reset);
    afterEach(vi.restoreAllMocks);

    describe('Registration', () => {
        /**
         * A check whose `@Injectable` omits `type: HEALTH_CHECKS` resolves and injects
         * normally while being invisible to `injectMany` — the app would report healthy
         * having checked nothing. Asserting a 200 does not catch that; asserting the
         * name set does.
         */
        it('Should register exactly the expected checks', () => {
            const names = PlatformTest.get<HealthCheckService>(HealthCheckService)
                .checks()
                .map((check) => check.name);

            expect(names.sort()).toEqual(['mongodb']);
        });
    });

    describe('GET /health/live', () => {
        it('Should return 200', async () => {
            expect.assertions(1);

            const response = await request.get('/health/live').expect(200);

            expect(response.body).toEqual({ status: 'pass' });
        });

        // Liveness must never consult a dependency: a Mongo blip restarting every replica
        // of every service at once is the failure this whole design exists to avoid.
        it('Should return 200 even when Mongo is failing', async () => {
            expect.assertions(1);
            vi.spyOn(mongoCheck, 'check').mockReturnValue({ status: HealthStatus.Fail, detail: 'disconnected' });

            const response = await request.get('/health/live').expect(200);

            expect(response.body).toEqual({ status: 'pass' });
        });
    });

    describe('GET /health/ready', () => {
        /**
         * `config/test.json` sets `mongodb.enabled: false`, so this exercises the
         * disabled-by-config guard for real. Without it a valid deployment with Mongo
         * switched off would report `fail` forever and the pod would never enter
         * Endpoints — silently, with no restart and no error log.
         */
        it('Should return 200 when Mongo is disabled by config', async () => {
            expect.assertions(1);

            const response = await request.get('/health/ready').expect(200);

            expect(response.body).toEqual({ status: 'pass' });
        });

        it('Should return 503 when Mongo is down', async () => {
            expect.assertions(1);
            vi.spyOn(mongoCheck, 'check').mockReturnValue({ status: HealthStatus.Fail, detail: 'disconnected' });

            const response = await request.get('/health/ready').expect(503);

            expect(response.body).toEqual({ status: 'fail' });
        });
    });

    describe('GET /health', () => {
        it('Should report the check by name', async () => {
            expect.assertions(1);

            const response = await request.get('/health').expect(200);

            expect(response.body).toEqual({
                status: 'pass',
                checks: { mongodb: { status: 'pass', detail: 'disabled' } }
            });
        });

        it('Should return 503 and name the failing check when Mongo is down', async () => {
            expect.assertions(1);
            vi.spyOn(mongoCheck, 'check').mockReturnValue({ status: HealthStatus.Fail, detail: 'disconnected' });

            const response = await request.get('/health').expect(503);

            expect(response.body).toEqual({
                status: 'fail',
                checks: { mongodb: { status: 'fail', detail: 'disconnected' } }
            });
        });
    });
});
