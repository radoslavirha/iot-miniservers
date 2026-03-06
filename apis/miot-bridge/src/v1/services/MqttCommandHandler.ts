import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { $log } from '@tsed/logger';
import { CommonUtils } from '@radoslavirha/utils';
import { JSONSchemaValidator, Serializer } from '@radoslavirha/tsed-common';
import { APIVersion } from '../../global/models/APIVersion.enum.js';
import { MQTTHandlerToken } from '../../global/tokens/MQTTHandlerToken.js';
import type { IMqttVersionHandler } from '../../global/services/IMqttVersionHandler.js';
import { DeviceCommandRequest } from '../../global/models/DeviceCommandRequest.js';
import { CommandResponseModel } from '../../global/models/CommandResponseModel.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { DeviceCommandService } from '../../global/services/DeviceCommandService.js';

/**
 * Handles v1 MQTT command requests.
 * Registered as MQTTHandlerToken type — MqttCommandRouter receives it via @Inject(MQTTHandlerToken).
 */
@Injectable({ type: MQTTHandlerToken })
@Scope(ProviderScope.SINGLETON)
export class MqttCommandHandler implements IMqttVersionHandler {
    readonly version = APIVersion.V1;

    constructor(private readonly deviceCommandService: DeviceCommandService) {}

    async handle(payload: Buffer): Promise<string> {
        try {
            const raw = JSON.parse(payload.toString('utf8')) as unknown;
            const request = await JSONSchemaValidator.validate<CommandRequestModel>(CommandRequestModel, raw);

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
            $log.error({ event: 'MQTT_COMMAND_FAILED', message });
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
