import type { HealthCheck } from '@radoslavirha/health';
import { injectMany } from '@tsed/di';
import { MongooseService } from '@tsed/mongoose';
import { PlatformTest } from '@tsed/platform-http/testing';
import { TestContainersMongo } from '@tsed/testcontainers-mongo';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HEALTH_CHECKS } from './HEALTH_CHECKS.js';
import { HealthCheckService } from './HealthCheckService.js';
import { MongoHealthCheck } from './mongoose.js';
import { TestMongoServer } from './test/TestMongoServer.js';
import { HealthStatus } from '@radoslavirha/health';

/**
 * Exercised against a **real** MongoDB.
 *
 * Mocking `readyState` proves the mapping table but assumes the premise the whole
 * `critical: true` design rests on: that `readyState === 1` genuinely means usable, and
 * that it genuinely drops when the connection goes away. That is mongoose's behaviour, not
 * ours — if it lingered at `1` after a disconnect, readiness would report healthy straight
 * through an outage and the probe would be worthless.
 *
 * HTTP-level behaviour is not retested here: `TestContainersMongo.create` builds the DI
 * container rather than an HTTP platform, and `HealthController.integration.spec.ts`
 * already covers the endpoints. This file exists for what only a real database can prove.
 */
describe('MongoHealthCheck (real MongoDB)', () => {
    let check: MongoHealthCheck;
    let mongooseService: MongooseService;

    beforeEach(() => TestContainersMongo.create(TestMongoServer));
    beforeEach(() => {
        check = PlatformTest.get<MongoHealthCheck>(MongoHealthCheck);
        mongooseService = PlatformTest.get<MongooseService>(MongooseService);
    });
    afterEach(() => TestContainersMongo.reset());

    describe('Connected', () => {
        it('Should pass against a live connection', () => {
            expect.assertions(2);

            // The premise: a working connection really is readyState 1.
            expect(mongooseService.get()?.readyState).toBe(1);
            expect(check.check()).toEqual({ status: HealthStatus.Pass });
        });

        it('Should report ready through the registry', async () => {
            expect.assertions(1);

            const { ready } = await PlatformTest.get<HealthCheckService>(HealthCheckService).evaluate();

            expect(ready).toBe(true);
        });
    });

    describe('Disconnected', () => {
        it('Should fail once the connection is closed', async () => {
            expect.assertions(2);
            const connection = mongooseService.get();

            await connection?.close();

            // The behaviour the design depends on: readyState really drops.
            expect(connection?.readyState).toBe(0);
            expect(check.check()).toEqual({ status: HealthStatus.Fail, detail: 'disconnected' });
        });

        // End to end through the registry: a real disconnect must gate readiness.
        it('Should gate readiness once the connection is closed', async () => {
            expect.assertions(2);
            await mongooseService.get()?.close();

            const { ready, report } = await PlatformTest
                .get<HealthCheckService>(HealthCheckService)
                .evaluate();

            expect(ready).toBe(false);
            expect(report.checks?.mongodb).toEqual({ status: HealthStatus.Fail, detail: 'disconnected' });
        });

        it('Should never leak the connection URI', async () => {
            expect.assertions(1);
            await mongooseService.get()?.close();

            const { report } = await PlatformTest
                .get<HealthCheckService>(HealthCheckService)
                .evaluate();

            expect(JSON.stringify(report)).not.toContain('mongodb://');
        });
    });

    describe('Registration', () => {
        it('Should be named mongodb and be critical', () => {
            expect(check.name).toBe('mongodb');
            expect(check.critical).toBe(true);
        });

        // A check missing `type: HEALTH_CHECKS` resolves normally and is never evaluated.
        it('Should register itself under HEALTH_CHECKS', () => {
            const names = injectMany<HealthCheck>(HEALTH_CHECKS).map((c) => c.name);

            expect(names).toContain('mongodb');
        });
    });
});
