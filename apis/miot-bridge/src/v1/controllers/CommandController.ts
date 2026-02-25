import { Controller, Scope, ProviderScope } from '@tsed/di';
import { BodyParams } from '@tsed/platform-params';
import { Description, Post, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { CommandHandler } from '../handlers/CommandHandler.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { APIVersion } from '../../global/models/APIVersion.enum.js';

@Description('Endpoint for sending commands (read/write property, execute action) to registered devices.')
@Controller('/command')
@Scope(ProviderScope.SINGLETON)
@Docs(APIVersion.V1)
export class CommandController {
    constructor(private readonly commandHandler: CommandHandler) {}

    @Post('/')
    @Description('Sends a command to a registered device. Validates the operation against the device MIoT spec.')
    @Returns(200, CommandResponseModel)
    async command(
        @BodyParams(CommandRequestModel) body: CommandRequestModel
    ): Promise<CommandResponseModel> {
        return this.commandHandler.execute(body);
    }
}
