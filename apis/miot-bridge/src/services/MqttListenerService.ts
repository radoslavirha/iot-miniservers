import { Inject, Injectable, Scope, ProviderScope, OnInit } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { JSONSchemaValidator } from '@radoslavirha/tsed-common';
import type { MqttClient } from 'mqtt';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { MqttTopicService } from './MqttTopicService.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { BaseLogger, Logger } from '@radoslavirha/tsed-logger';

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

        const topics = this.mqttTopicService.get();

        this.mqttClient.subscribe(topics.command, { qos: 1 }, (err) => {
            if (CommonUtils.notNil(err)) {
                this.logger.error(`Failed to subscribe to MQTT topic ${topics.command}: ${err.message}`);
            } else {
                this.logger.info(`Subscribed to MQTT topic ${topics.command}`);
                this.logger.info(`MQTT response topic: ${topics.response}`);
            }
        });

        this.mqttClient.on('message', (topic: string, payload: Buffer) => {
            if (topic !== topics.command) {
                return;
            }

            void this.handleMessage(payload).then((result) => {
                if (CommonUtils.isNil(result)) {
                    return;
                }
                this.mqttClient!.publish(topics.response, result, { qos: 1 }, (err) => {
                    if (CommonUtils.notNil(err)) {
                        this.logger.error(`Failed to publish MQTT response to topic ${topics.response}: ${err.message}`);
                    } else {
                        this.logger.debug(`MQTT response published to topic ${topics.response}`);
                    }
                });
            });
        });
    }

    private async handleMessage(payload: Buffer): Promise<string | null> {
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

        let request: CommandRequestModel;

        try {
            request = JSONSchemaValidator.validate(CommandRequestModel, parsed);
        } catch (error) {
            this.logger.warn('MQTT payload validation failed.', { error });
            return `error: Validation failed. ${this.stringifyError(error)}`;
        }

        try {
            const commandRequest = CommonUtils.buildModelStrict(DeviceCommandRequest, {
                deviceId: request.deviceId,
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
            this.logger.error(`MQTT command failed for device ${request.deviceId}, command ${request.command}: ${message}`);
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
