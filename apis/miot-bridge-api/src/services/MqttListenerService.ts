import { Inject, Injectable, Scope, ProviderScope, OnInit } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { JSONSchemaValidator } from '@radoslavirha/tsed-common';
import { SpanStatusCode, type Span } from '@opentelemetry/api';
import type { IPublishPacket, MqttClient } from 'mqtt';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { MqttCommandRequestModel } from '../models/MqttCommandRequestModel.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { MqttTopicService } from './MqttTopicService.js';
import { MqttTracingService } from './MqttTracingService.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { BaseLogger, Logger } from '@radoslavirha/tsed-logger';
import { ATTR_MIOT_COMMAND, ATTR_MIOT_DEVICE_ID, ATTR_MIOT_OPERATION, identifierAttribute } from '../otel/telemetry.js';

/** QoS used for both the command subscription and the response publish. */
const QOS = 1;

/**
 * Subscribes to inbound MQTT command messages and handles them directly.
 *
 * Topic convention (per-device, REST-like):
 *   - Inbound:  `[prefix/]miot-bridge/device/{deviceId}/command`
 *   - Outbound: `[prefix/]miot-bridge/device/{deviceId}/response`
 *
 * Device ID is extracted from the topic; it must NOT be included in the payload.
 * When `mqtt.enabled` is false the provider resolves to `null` and this
 * service becomes a no-op.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MqttListenerService implements OnInit {
    private readonly logger: BaseLogger;
    constructor(
        @Inject(MqttClientProvider) private readonly mqttClient: MqttClient | null,
        private readonly mqttTopicService: MqttTopicService,
        private readonly mqttTracingService: MqttTracingService,
        private readonly deviceCommandService: DeviceCommandService,
        logger: Logger
    ) {
        this.logger = logger.child('MQTT_LISTENER');
    }

    public $onInit(): void {
        this.start();
    }

    private start(): void {
        if (CommonUtils.isNil(this.mqttClient)) {
            this.logger.info('MQTT client not available — skipping command subscription.');
            return;
        }

        const client = this.mqttClient;

        // Subscribe now, and again on every subsequent connect.
        //
        // The provider resolves only once the client has connected, so the first SUBSCRIBE has
        // to be issued here rather than waited for — by the time this runs, the `connect` event
        // that would trigger it has already fired.
        //
        // mqtt.js does resubscribe on its own: `resubscribe` defaults to true and `_resubscribe()`
        // runs on any non-first connect while `clean` is true, which is also the default. This
        // does not lean on that. Both are library-internal defaults that nothing in this repo
        // asserts, and the failure mode if either changes is silent — the client stays connected,
        // reports healthy, and simply stops receiving commands. SUBSCRIBE is idempotent, so
        // issuing our own costs one packet per reconnect and removes the dependency.
        this.subscribe(client);
        client.on('connect', () => this.subscribe(client));

        // Registered once, outside `subscribe`: handlers survive a reconnect, and re-adding this
        // one per connect would deliver every message as many times as the link has dropped.
        client.on('message', (topic: string, payload: Buffer, packet: IPublishPacket) => {
            const deviceId = this.mqttTopicService.extractDeviceIdFromCommandTopic(topic);
            if (CommonUtils.isNil(deviceId)) {
                return;
            }

            void this.onMessage(topic, deviceId, payload, packet);
        });
    }

    /** Issues the command subscription. Idempotent, and safe to repeat on every reconnect. */
    private subscribe(client: MqttClient): void {
        const pattern = this.mqttTopicService.getCommandSubscriptionPattern();

        client.subscribe(pattern, { qos: QOS }, (err) => {
            if (CommonUtils.notNil(err)) {
                this.logger.error(`Failed to subscribe to MQTT topic ${pattern}: ${err.message}`);
            } else {
                this.logger.info(`Subscribed to MQTT topic ${pattern}`);
            }
        });
    }

    /**
     * Handles one inbound command and publishes its response, all inside a single consumer
     * span.
     *
     * The span has to wrap *both* halves. Everything the command touches on the way — the miot
     * cloud call via axios, Mongo lookups — is traced by auto-instrumentations that know
     * nothing about MQTT and simply attach to whatever span is current; without this wrapper
     * they attach to nothing and each becomes its own orphan trace. Wrapping the response
     * publish too is what makes it a child rather than a fourth root.
     *
     * Never rejects: a failure inside is already turned into an `error:` response payload or
     * logged by the publish path, and this is called from an event handler where a rejection
     * would surface as an unhandled one.
     */
    private async onMessage(topic: string, deviceId: number, payload: Buffer, packet: IPublishPacket): Promise<void> {
        await this.mqttTracingService.consume(
            {
                topic,
                topicTemplate: this.mqttTopicService.getCommandTopicTemplate(),
                qos: packet.qos,
                bodySize: payload.length,
                userProperties: packet.properties?.userProperties,
                attributes: { [ATTR_MIOT_DEVICE_ID]: identifierAttribute(deviceId) }
            },
            async (span) => {
                const result = await this.handleMessage(deviceId, payload, span);

                if (CommonUtils.isNil(result)) {
                    return;
                }

                await this.publishResponse(deviceId, result);
            }
        );
    }

    private async publishResponse(deviceId: number, result: string): Promise<void> {
        const topic = this.mqttTopicService.getResponseTopic(deviceId);

        await this.mqttTracingService.publish(
            {
                topic,
                topicTemplate: this.mqttTopicService.getResponseTopicTemplate(),
                qos: QOS,
                bodySize: Buffer.byteLength(result),
                attributes: { [ATTR_MIOT_DEVICE_ID]: identifierAttribute(deviceId) }
            },
            async (userProperties, span) => {
                try {
                    await this.mqttClient!.publishAsync(topic, result, { qos: QOS, properties: { userProperties } });
                    this.logger.debug(`MQTT response published to topic ${topic}`);
                } catch (error) {
                    // Marked on the span but not rethrown: an undeliverable response is not a
                    // reason to fail the command that produced it, which is how this behaved
                    // before it was traced.
                    const message = this.stringifyError(error);
                    this.setSpanError(span, message);
                    this.logger.error(`Failed to publish MQTT response to topic ${topic}: ${message}`);
                }
            }
        );
    }

    private async handleMessage(deviceId: number, payload: Buffer, span: Span): Promise<string | null> {
        if (payload.length === 0) {
            return null;
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(payload.toString('utf8'));
        } catch {
            this.setSpanError(span, 'Invalid JSON.');
            this.logger.warn('Received non-JSON MQTT payload.');
            return 'error: Invalid JSON.';
        }

        let request: MqttCommandRequestModel;

        try {
            request = JSONSchemaValidator.validate(MqttCommandRequestModel, parsed);
        } catch (error) {
            this.setSpanError(span, `Validation failed. ${this.stringifyError(error)}`);
            this.logger.warn('MQTT payload validation failed.', { error });
            return `error: Validation failed. ${this.stringifyError(error)}`;
        }

        span.setAttributes({ [ATTR_MIOT_COMMAND]: request.command, [ATTR_MIOT_OPERATION]: request.operation });

        try {
            const commandRequest = CommonUtils.buildModelStrict(DeviceCommandRequest, {
                deviceId: deviceId,
                command: request.command,
                operation: request.operation,
                value: request.value
            });

            const response = await this.deviceCommandService.execute(commandRequest);

            if (response.operation === DeviceCommandOperation.Action) {
                return '';
            }

            return String(response.value ?? '');
        } catch (error) {
            const message = this.stringifyError(error);
            this.setSpanError(span, message);
            this.logger.error(`MQTT command failed for device ${deviceId}, command ${request.command}: ${message}`);
            return `error: ${message}`;
        }
    }

    /**
     * Marks the span failed for a fault this service handles itself.
     *
     * These paths all return an `error:` payload rather than throwing, so the span helper's
     * own rejection handling never sees them — without this, a command that answered
     * `error: Invalid JSON.` would look successful in Tempo.
     */
    private setSpanError(span: Span, message: string): void {
        span.setStatus({ code: SpanStatusCode.ERROR, message });
    }

    private stringifyError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }
}
