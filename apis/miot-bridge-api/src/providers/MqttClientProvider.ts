import { injectable, inject } from '@tsed/di';
import { connect, type MqttClient } from 'mqtt';
import { ConfigService } from '../services/ConfigService.js';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { Logger } from '@radoslavirha/tsed-logger';

const RECONNECT_PERIOD_MS = 5_000;
const MAX_STARTUP_ERRORS = 5;

/**
 * MQTT 5, not the library default of 4 (3.1.1).
 *
 * 3.1.1 has nowhere to put a `traceparent`: it carries a topic and an opaque payload and
 * nothing else. MQTT 5 user properties are that carrier, and they are what makes an inbound
 * command join the caller's trace instead of starting an orphan one — see `withMqttConsumeSpan`
 * in `@radoslavirha/otel`. Embedding the header in the JSON payload instead is not an option:
 * `MqttCommandRequestModel` is `@AdditionalProperties(false)` and the payload is a contract
 * with the miniserver.
 *
 * Safe to raise unilaterally — MQTT version is negotiated per connection, so publishers still
 * on 3.1.1 are unaffected. Requires a broker that speaks v5; EMQX does.
 */
const PROTOCOL_VERSION = 5;

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
        const logger = inject<Logger>(Logger).child('MQTT_PROVIDER');
        const mqttConfig = configService.config.mqtt;

        if (!ObjectUtils.isEnabled(mqttConfig)) {
            logger.info('MQTT is disabled — skipping broker connection.');
            return null;
        }

        return new Promise<MqttClient>((resolve, reject) => {
            let connected = false;
            let startupErrorCount = 0;

            const client = connect(mqttConfig.url, {
                clientId: mqttConfig.clientId,
                username: mqttConfig.username,
                password: mqttConfig.password,
                protocolVersion: PROTOCOL_VERSION,
                reconnectPeriod: RECONNECT_PERIOD_MS
            });

            client.once('connect', () => {
                connected = true;
                logger.info('MQTT client connected.', { url: mqttConfig.url, clientId: mqttConfig.clientId });
                resolve(client);
            });

            client.on('error', (err: Error) => {
                if (connected) {
                    logger.error('MQTT client error.', { url: mqttConfig.url, message: err.message });
                    return;
                }

                startupErrorCount++;
                logger.error('MQTT client connect error.', {
                    url: mqttConfig.url,
                    message: err.message,
                    attempt: startupErrorCount,
                    maxAttempts: MAX_STARTUP_ERRORS
                });

                if (startupErrorCount >= MAX_STARTUP_ERRORS) {
                    logger.error('MQTT client connect failed.', { url: mqttConfig.url, message: `Failed to connect after ${MAX_STARTUP_ERRORS} attempts.` });
                    client.end(true);
                    reject(new Error(`MQTT connection failed after ${MAX_STARTUP_ERRORS} attempts: ${err.message}`));
                }
            });

            client.on('disconnect', () => {
                logger.warn('MQTT client disconnected.', { url: mqttConfig.url });
            });

            client.on('reconnect', () => {
                logger.info('MQTT client reconnecting.', { url: mqttConfig.url });
            });
        });
    })
    .hooks({
        async $onDestroy(client: MqttClient | null): Promise<void> {
            const logger = inject<Logger>(Logger).child('MqttClientProvider');
            if (CommonUtils.isNil(client)) {
                return;
            }
            await client.endAsync();
            logger.info('MQTT client disconnected.');
        }
    })
    .token();

export type MqttClientProvider = typeof MqttClientProvider;
