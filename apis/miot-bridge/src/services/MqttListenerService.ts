import { Inject, Injectable, Scope, ProviderScope, OnInit } from '@tsed/di';
import { $log } from '@tsed/logger';
import { CommonUtils } from '@radoslavirha/utils';
import { JSONSchemaValidator, Serializer } from '@radoslavirha/tsed-common';
import type { MqttClient } from 'mqtt';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { MqttTopicService } from './MqttTopicService.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';

/**
 * Subscribes to inbound MQTT command messages and handles them directly.
 *
 * Topic convention:
 *   - Inbound:  `miot-bridge/command`
 *   - Outbound: `miot-bridge/response`
 *
 * When `mqtt.enabled` is false the provider resolves to `null` and this
 * service becomes a no-op.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MqttListenerService implements OnInit {
    constructor(
        @Inject(MqttClientProvider) private readonly mqttClient: MqttClient | null,
        private readonly mqttTopicService: MqttTopicService,
        private readonly deviceCommandService: DeviceCommandService
    ) {}

    public $onInit(): void {
        this.start();
    }

    private start(): void {
        if (!this.mqttClient) {
            $log.info({ event: 'MQTT_LISTENER_DISABLED', message: 'MQTT client not available — skipping command subscription.' });
            return;
        }

        const topics = this.mqttTopicService.get();

        this.mqttClient.subscribe(topics.command, { qos: 1 }, (err) => {
            if (err) {
                $log.error({ event: 'MQTT_SUBSCRIBE_ERROR', topic: topics.command, message: err.message });
            } else {
                $log.info({ event: 'MQTT_SUBSCRIBED', topic: topics.command });
                $log.info({ event: 'MQTT_RESPONSE_TOPIC', topic: topics.response });
                $log.info({ event: 'MQTT_NOTIFICATION_TOPIC', topic: topics.notifications });
            }
        });

        this.mqttClient.on('message', (topic: string, payload: Buffer) => {
            if (topic !== topics.command) {
                return;
            }

            void this.handleMessage(payload).then((result) => {
                this.mqttClient!.publish(topics.response, result, { qos: 1 }, (err) => {
                    if (err) {
                        $log.error({ event: 'MQTT_RESPONSE_PUBLISH_ERROR', topic: topics.response, message: err.message });
                    } else {
                        $log.debug({ event: 'MQTT_RESPONSE_PUBLISHED', topic: topics.response });
                    }
                });
            });
        });
    }

    private async handleMessage(payload: Buffer): Promise<string> {
        let parsed: unknown;

        try {
            parsed = JSON.parse(payload.toString('utf8'));
        } catch {
            $log.warn({ event: 'MQTT_INVALID_JSON', message: 'Received non-JSON MQTT payload.' });
            return JSON.stringify({ success: false, error: 'Invalid JSON.' });
        }

        let request: CommandRequestModel;

        try {
            request = JSONSchemaValidator.validate(CommandRequestModel, parsed);
        } catch (error) {
            $log.warn({ event: 'MQTT_VALIDATION_FAILED', message: 'MQTT payload validation failed.', error });
            return JSON.stringify({ success: false, error: `Validation failed. ${this.stringifyError(error)}` });
        }

        try {
            const commandRequest = CommonUtils.buildModel(DeviceCommandRequest, {
                deviceId: request.deviceId,
                command: request.command,
                operation: request.operation,
                value: request.value
            });

            const response = await this.deviceCommandService.execute(commandRequest);
            return JSON.stringify(Serializer.serialize(response, CommandResponseModel));
        } catch (error) {
            const message = this.stringifyError(error);
            $log.error({ event: 'MQTT_COMMAND_FAILED', message, deviceId: request.deviceId, command: request.command });
            return JSON.stringify({ success: false, error: message });
        }
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
