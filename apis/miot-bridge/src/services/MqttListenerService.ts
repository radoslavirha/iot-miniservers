import { Inject, Injectable, Scope, ProviderScope, OnInit } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { JSONSchemaValidator } from '@radoslavirha/tsed-common';
import type { MqttClient } from 'mqtt';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { MqttCommandRequestModel } from '../models/MqttCommandRequestModel.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { MqttTopicService } from './MqttTopicService.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { BaseLogger, Logger } from '@radoslavirha/tsed-logger';

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

        const pattern = this.mqttTopicService.getCommandSubscriptionPattern();

        this.mqttClient.subscribe(pattern, { qos: 1 }, (err) => {
            if (CommonUtils.notNil(err)) {
                this.logger.error(`Failed to subscribe to MQTT topic ${pattern}: ${err.message}`);
            } else {
                this.logger.info(`Subscribed to MQTT topic ${pattern}`);
            }
        });

        this.mqttClient.on('message', (topic: string, payload: Buffer) => {
            const deviceId = this.mqttTopicService.extractDeviceIdFromCommandTopic(topic);
            if (CommonUtils.isNil(deviceId)) {
                return;
            }

            void this.handleMessage(deviceId, payload).then((result) => {
                if (CommonUtils.isNil(result)) {
                    return;
                }
                const responseTopic = this.mqttTopicService.getResponseTopic(deviceId);
                this.mqttClient!.publish(responseTopic, result, { qos: 1 }, (err) => {
                    if (CommonUtils.notNil(err)) {
                        this.logger.error(`Failed to publish MQTT response to topic ${responseTopic}: ${err.message}`);
                    } else {
                        this.logger.debug(`MQTT response published to topic ${responseTopic}`);
                    }
                });
            });
        });
    }

    private async handleMessage(deviceId: number, payload: Buffer): Promise<string | null> {
        if (payload.length === 0) {
            return null;
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(payload.toString('utf8'));
        } catch {
            this.logger.warn('Received non-JSON MQTT payload.');
            return 'error: Invalid JSON.';
        }

        let request: MqttCommandRequestModel;

        try {
            request = JSONSchemaValidator.validate(MqttCommandRequestModel, parsed);
        } catch (error) {
            this.logger.warn('MQTT payload validation failed.', { error });
            return `error: Validation failed. ${this.stringifyError(error)}`;
        }

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
            this.logger.error(`MQTT command failed for device ${deviceId}, command ${request.command}: ${message}`);
            return `error: ${message}`;
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
