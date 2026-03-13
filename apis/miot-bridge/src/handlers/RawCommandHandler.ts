import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { PlatformContext } from '@tsed/platform-http';
import { BadRequest } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { RawCommandRequest } from '../models/RawCommandRequest.js';
import { RawCommandRequestModel } from '../models/RawCommandRequestModel.js';
import { CommandValueResponse } from '../models/CommandValueResponse.js';
import { DeviceCommandService } from '../services/DeviceCommandService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class RawCommandHandler {
    constructor(private readonly deviceCommandService: DeviceCommandService) {}

    public async execute(request: RawCommandRequestModel, ctx: PlatformContext): Promise<CommandValueResponse | void> {
        if (
            (request.operation === DeviceCommandOperation.GetProperty || request.operation === DeviceCommandOperation.SetProperty) &&
            CommonUtils.isNil(request.piid)
        ) {
            throw new BadRequest(`piid is required for ${request.operation} operations.`);
        }

        if (request.operation === DeviceCommandOperation.Action && CommonUtils.isNil(request.aiid)) {
            throw new BadRequest(`aiid is required for ${DeviceCommandOperation.Action} operations.`);
        }

        const commandRequest = CommonUtils.buildModelStrict(RawCommandRequest, {
            deviceId: request.deviceId,
            operation: request.operation,
            siid: request.siid,
            piid: request.piid,
            aiid: request.aiid,
            value: request.value
        });

        const response = await this.deviceCommandService.executeRaw(commandRequest);

        if (response.operation === DeviceCommandOperation.Action) {
            ctx.response.status(204);
            return;
        }
        ctx.response.status(200);
        return CommonUtils.buildModelStrict(CommandValueResponse, { value: response.value! });
    }
}
