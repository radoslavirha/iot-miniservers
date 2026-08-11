import { HealthCheckService } from '@radoslavirha/tsed-health';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoHealthCheck } from '@radoslavirha/tsed-health/mongoose';
import { MqttHealthCheck } from './MqttHealthCheck.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { Server } from '../Server.js';
import { HealthStatus } from '@radoslavirha/tsed-health';

describe('Health endpoints (integration)', () => {
    let request: SuperTest.Agent;
    let mongoCheck: MongoHealthCheck;
    let mqttCheck: MqttHealthCheck;

    // Same override as Server.integration.spec.ts — the real provider would otherwise be
    // built from config, and MqttListenerService expects a live client.
    beforeEach(PlatformTest.bootstrap(Server, {
        imports: [{ token: MqttClientProvider, use: null }]
    }));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
        mongoCheck = PlatformTest.get<MongoHealthCheck>(MongoHealthCheck);
        mqttCheck = PlatformTest.get<MqttHealthCheck>(MqttHealthCheck);
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

            expect(names.sort()).toEqual(['mongodb', 'mqtt']);
        });
    });

    describe('GET /health/live', () => {
        it('Should return 200', async () => {
            expect.assertions(1);

            const response = await request.get('/health/live').expect(200);

            expect(response.body).toEqual({ status: 'pass' });
        });

        /**
         * Liveness must stay shallow with *both* dependencies down. This is the assertion
         * that stops a Mongo or broker blip from restarting every replica at once, which
         * would then reconnect together and turn the health check into the outage.
         */
        it('Should return 200 with both Mongo and MQTT failing', async () => {
            expect.assertions(1);
            vi.spyOn(mongoCheck, 'check').mockReturnValue({ status: HealthStatus.Fail, detail: 'disconnected' });
            vi.spyOn(mqttCheck, 'check').mockReturnValue({ status: HealthStatus.Fail, detail: 'disconnected' });

            const response = await request.get('/health/live').expect(200);

            expect(response.body).toEqual({ status: 'pass' });
        });
    });

    describe('GET /health/ready', () => {
        // Test config omits `mongodb` and sets `mqtt.enabled: false`, so this covers the
        // disabled-by-config guards for real: both must report pass, not fail.
        it('Should return 200 when both dependencies are disabled by config', async () => {
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

        it('Should return 503 when the broker is down', async () => {
            expect.assertions(1);
            vi.spyOn(mqttCheck, 'check').mockReturnValue({ status: HealthStatus.Fail, detail: 'disconnected' });

            const response = await request.get('/health/ready').expect(503);

            expect(response.body).toEqual({ status: 'fail' });
        });
    });

    describe('GET /health', () => {
        it('Should report both checks by name', async () => {
            expect.assertions(1);

            const response = await request.get('/health').expect(200);

            expect(response.body).toEqual({
                status: 'pass',
                checks: {
                    mongodb: { status: 'pass', detail: 'disabled' },
                    mqtt: { status: 'pass', detail: 'disabled' }
                }
            });
        });

        it('Should name the failing dependency', async () => {
            expect.assertions(1);
            vi.spyOn(mqttCheck, 'check').mockReturnValue({ status: HealthStatus.Fail, detail: 'disconnected' });

            const response = await request.get('/health').expect(503);

            expect(response.body.checks.mqtt).toEqual({ status: 'fail', detail: 'disconnected' });
        });
    });
});
