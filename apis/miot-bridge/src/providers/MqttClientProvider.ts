import { injectable, inject } from '@tsed/di';
import { $log } from '@tsed/logger';
import { connect, type MqttClient } from 'mqtt';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Ts.ED custom provider that holds a connected MQTT client instance.
 *
 * - Resolves to a connected {@link MqttClient} when `mqtt.enabled` is `true`.
 * - Resolves to `null` when MQTT is disabled, allowing consumers to guard
 *   with a simple null-check.
 * - The connection is established asynchronously during server startup
 *   (`asyncFactory`) and torn down cleanly via the `$onDestroy` hook.
 *
 * Inject via:
 * ```ts
 * constructor(@Inject(MqttClientProvider) private readonly mqtt: MqttClientProvider) {}
 * ```
 */
export const MqttClientProvider = injectable(Symbol.for('MqttClient'))
    .asyncFactory(async () => {
        const configService = inject<ConfigService>(ConfigService);
        const mqttConfig = configService.config.mqtt;

        if (!mqttConfig?.enabled) {
            $log.info({ event: 'MQTT_CLIENT_DISABLED', message: 'MQTT is disabled — skipping broker connection.' });
            return null;
        }

        return new Promise<MqttClient>((resolve, reject) => {
            const client = connect(mqttConfig.url, {
                clientId: mqttConfig.clientId,
                username: mqttConfig.username,
                password: mqttConfig.password
            });

            client.once('connect', () => {
                $log.info({ event: 'MQTT_CLIENT_CONNECTED', url: mqttConfig.url, clientId: mqttConfig.clientId });
                resolve(client);
            });

            client.once('error', (err: Error) => {
                $log.error({ event: 'MQTT_CLIENT_CONNECT_ERROR', url: mqttConfig.url, message: err.message });
                client.end(true);
                reject(err);
            });

            client.on('error', (err: Error) => {
                $log.error({ event: 'MQTT_CLIENT_ERROR', url: mqttConfig.url, message: err.message });
            });

            client.on('disconnect', () => {
                $log.warn({ event: 'MQTT_CLIENT_DISCONNECTED', url: mqttConfig.url });
            });

            client.on('reconnect', () => {
                $log.info({ event: 'MQTT_CLIENT_RECONNECTING', url: mqttConfig.url });
            });
        });
    })
    .hooks({
        async $onDestroy(client: MqttClient | null): Promise<void> {
            if (client === null) return;
            await client.endAsync();
            $log.info({ event: 'MQTT_CLIENT_STOPPED', message: 'MQTT client disconnected.' });
        }
    })
    .token();

export type MqttClientProvider = typeof MqttClientProvider;
