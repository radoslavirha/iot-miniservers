import { Inject, Injectable, Scope, ProviderScope, OnInit } from '@tsed/di';
import { $log } from '@tsed/logger';
import type { MqttClient } from 'mqtt';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { MqttCommandRouter, type MqttTopicPair } from './MqttCommandRouter.js';

/**
 * Subscribes to inbound MQTT command messages and routes them to the correct
 * versioned {@link IMqttVersionHandler} via {@link MqttCommandRouter}.
 *
 * Exact subscription topics are derived from the router's registered handlers
 * (e.g. `miot-bridge/v1/command`) — no wildcard subscriptions or regex needed.
 *
 * Topic convention:
 *   - Inbound:  `miot-bridge/{version}/command`
 *   - Outbound: `miot-bridge/{version}/response`
 *
 * When `mqtt.enabled` is false the provider resolves to `null` and this
 * service becomes a no-op.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MqttListenerService implements OnInit {
    constructor(
        @Inject(MqttClientProvider) private readonly mqttClient: MqttClient | null,
        private readonly router: MqttCommandRouter
    ) {}

    public $onInit(): void {
        this.start();
    }

    // ─── Private ─────────────────────────────────────────────

    private start(): void {
        if (!this.mqttClient) {
            $log.info({ event: 'MQTT_LISTENER_DISABLED', message: 'MQTT client not available — skipping command subscription.' });
            return;
        }

        const pairs = this.router.topics();

        for (const pair of pairs) {
            this.mqttClient.subscribe(pair.command, { qos: 1 }, (err) => {
                if (err) {
                    $log.error({ event: 'MQTT_SUBSCRIBE_ERROR', topic: pair.command, message: err.message });
                } else {
                    $log.info({ event: 'MQTT_SUBSCRIBED', topic: pair.command });
                }
            });
        }

        const pairByCommand = new Map<string, MqttTopicPair>(pairs.map(p => [p.command, p]));

        this.mqttClient.on('message', (topic: string, payload: Buffer) => {
            const pair = pairByCommand.get(topic);
            if (!pair) {
                return;
            }

            void this.router.route(payload, pair.command).then((result) => {
                this.mqttClient!.publish(pair.response, result, { qos: 1 }, (err) => {
                    if (err) {
                        $log.error({ event: 'MQTT_RESPONSE_PUBLISH_ERROR', topic: pair.response, message: err.message });
                    } else {
                        $log.debug({ event: 'MQTT_RESPONSE_PUBLISHED', topic: pair.response });
                    }
                });
            });
        });
    }
}
