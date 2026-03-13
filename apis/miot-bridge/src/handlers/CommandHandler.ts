import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { PlatformContext } from '@tsed/platform-http';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { CommandValueResponse } from '../models/CommandValueResponse.js';
import { DeviceCommandService } from '../services/DeviceCommandService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class CommandHandler {
    constructor(private readonly deviceCommandService: DeviceCommandService) {}

    public async execute(request: CommandRequestModel, ctx: PlatformContext): Promise<CommandValueResponse | void> {
        const commandRequest = CommonUtils.buildModelStrict(DeviceCommandRequest, {
            deviceId: request.deviceId,
            command: request.command,
            operation: request.operation,
            value: request.value
        });

        const response = await this.deviceCommandService.execute(commandRequest);

        if (response.operation === DeviceCommandOperation.Action) {
            ctx.response.status(204);
            return;
        }
        ctx.response.status(200);
        return CommonUtils.buildModelStrict(CommandValueResponse, { value: response.value! });
    }
}
