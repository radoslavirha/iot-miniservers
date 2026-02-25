import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { CommandRoutingService } from '../services/CommandRoutingService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class CommandHandler {
    constructor(private readonly commandRoutingService: CommandRoutingService) {}

    async execute(request: CommandRequestModel): Promise<CommandResponseModel> {
        const commandRequest = CommonUtils.buildModel(DeviceCommandRequest, {
            deviceId: request.deviceId,
            command: request.command,
            operation: request.operation,
            value: request.value
        });

        return this.commandRoutingService.execute(commandRequest);
    }
}
