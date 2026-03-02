import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { $log } from '@tsed/logger';
import { CommonUtils } from '@radoslavirha/utils';
import { Serializer } from '@radoslavirha/tsed-common';
import type { RemoteInfo } from 'dgram';
import { APIVersion } from '../../global/models/APIVersion.enum.js';
import { UdpCommandRequestModel } from '../../global/models/UdpCommandRequestModel.js';
import { UDPHandlerToken } from '../../global/tokens/UDPHandlerToken.js';
import type { IUdpVersionHandler } from '../../global/services/IUdpVersionHandler.js';
import { DeviceCommandRequest } from '../../global/models/DeviceCommandRequest.js';
import { CommandResponseModel } from '../../global/models/CommandResponseModel.js';
import { DeviceCommandService } from '../../global/services/DeviceCommandService.js';

/**
 * Handles v1 UDP command requests.
 * Registered as UDPHandlerToken type — UdpCommandRouter receives it via @Inject(UDPHandlerToken).
 */
@Injectable({ type: UDPHandlerToken })
@Scope(ProviderScope.SINGLETON)
export class UdpCommandHandler implements IUdpVersionHandler {
    readonly version = APIVersion.V1;

    constructor(private readonly deviceCommandService: DeviceCommandService) {}

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async handle(request: UdpCommandRequestModel, _rinfo: RemoteInfo): Promise<string> {
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
            $log.error({ event: 'UDP_COMMAND_FAILED', message, deviceId: request.deviceId, command: request.command });
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
