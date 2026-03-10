import { injectable, inject } from '@tsed/di';
import { $log } from '@tsed/logger';
import { connect, type MqttClient } from 'mqtt';
import { ConfigService } from '../services/ConfigService.js';
import { ObjectUtils } from '@radoslavirha/utils';

const RECONNECT_PERIOD_MS = 5_000;
const MAX_STARTUP_ERRORS = 5;

/**
 * Ts.ED custom provider that holds a connected MQTT client instance.
 *
 * - Resolves to a connected {@link MqttClient} when `mqtt.enabled` is `true`.
 * - Resolves to `null` when MQTT is disabled, allowing consumers to guard
 *   with a simple null-check.
 * - The connection is established asynchronously during server startup
 *   (`asyncFactory`) and torn down cleanly via the `$onDestroy` hook.
 * - Reconnects automatically on transient errors (e.g. ECONNRESET).
 *   During startup, up to {@link MAX_STARTUP_ERRORS} consecutive errors are
 *   tolerated before the bootstrap promise is rejected.
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

        if (!ObjectUtils.isEnabled(mqttConfig)) {
            $log.info({ event: 'MQTT_CLIENT_DISABLED', message: 'MQTT is disabled — skipping broker connection.' });
            return null;
        }

        return new Promise<MqttClient>((resolve, reject) => {
            let connected = false;
            let startupErrorCount = 0;

            const client = connect(mqttConfig.url, {
                clientId: mqttConfig.clientId,
                username: mqttConfig.username,
                password: mqttConfig.password,
                reconnectPeriod: RECONNECT_PERIOD_MS
            });

            client.once('connect', () => {
                connected = true;
                $log.info({ event: 'MQTT_CLIENT_CONNECTED', url: mqttConfig.url, clientId: mqttConfig.clientId });
                resolve(client);
            });

            client.on('error', (err: Error) => {
                if (connected) {
                    $log.error({ event: 'MQTT_CLIENT_ERROR', url: mqttConfig.url, message: err.message });
                    return;
                }

                startupErrorCount++;
                $log.error({
                    event: 'MQTT_CLIENT_CONNECT_ERROR',
                    url: mqttConfig.url,
                    message: err.message,
                    attempt: startupErrorCount,
                    maxAttempts: MAX_STARTUP_ERRORS
                });

                if (startupErrorCount >= MAX_STARTUP_ERRORS) {
                    $log.error({ event: 'MQTT_CLIENT_CONNECT_FAILED', url: mqttConfig.url, message: `Failed to connect after ${MAX_STARTUP_ERRORS} attempts.` });
                    client.end(true);
                    reject(new Error(`MQTT connection failed after ${MAX_STARTUP_ERRORS} attempts: ${err.message}`));
                }
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
