import { PlatformTest } from '@tsed/platform-http/testing';
import type { MqttClient } from 'mqtt';
import { afterEach, describe, expect, it } from 'vitest';
import { MqttHealthCheck } from './MqttHealthCheck.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { HealthStatus } from '@radoslavirha/tsed-health';

/**
 * Minimal stand-in. The check reads `connected` and nothing else; `endAsync` is here only
 * because `MqttClientProvider`'s `$onDestroy` calls it when the test container is reset.
 */
const client = (connected: boolean): MqttClient =>
    ({ connected, endAsync: async () => undefined } as unknown as MqttClient);

const create = async (use: MqttClient | null): Promise<MqttHealthCheck> => {
    await PlatformTest.create({ imports: [{ token: MqttClientProvider, use }] });
    return PlatformTest.get<MqttHealthCheck>(MqttHealthCheck);
};

describe('MqttHealthCheck', () => {
    afterEach(PlatformTest.reset);

    describe('Enabled', () => {
        it('Should pass when the client is connected', async () => {
            const check = await create(client(true));

            expect(check.check()).toEqual({ status: HealthStatus.Pass });
        });

        /**
         * The case this check exists for. `MqttClientProvider` only rejects during
         * bootstrap, so a broker lost *after* startup leaves the client reconnecting
         * silently while the process looks healthy. Nothing else notices.
         */
        it('Should fail when the client is disconnected', async () => {
            const check = await create(client(false));

            expect(check.check()).toEqual({ status: HealthStatus.Fail, detail: 'disconnected' });
        });
    });

    describe('Disabled by config', () => {
        // The provider resolves to null when mqtt.enabled is false; reporting `fail` would
        // keep a valid HTTP-only deployment permanently out of Endpoints.
        it('Should pass when MQTT is switched off', async () => {
            const check = await create(null);

            expect(check.check()).toEqual({ status: HealthStatus.Pass, detail: 'disabled' });
        });
    });

    describe('Contract', () => {
        it('Should be named mqtt', async () => {
            const check = await create(null);

            expect(check.name).toBe('mqtt');
        });

        // A bridge with no broker cannot do its job.
        it('Should be critical', async () => {
            const check = await create(null);

            expect(check.critical).toBe(true);
        });
    });
});
