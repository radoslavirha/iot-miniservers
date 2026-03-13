import { Controller, Scope, ProviderScope } from '@tsed/di';
import { BodyParams, Context, QueryParams } from '@tsed/platform-params';
import { PlatformContext } from '@tsed/platform-http';
import { AcceptMime, Description, Get, Post, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { CommandHandler } from '../handlers/CommandHandler.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { CommandValueResponse } from '../models/CommandValueResponse.js';
import { SwaggerDocs } from '../models/SwaggerDocs.enum.js';

@Description('Endpoint for sending commands (read/write property, execute action) to registered devices.')
@Controller('/command')
@Scope(ProviderScope.SINGLETON)
@Docs(SwaggerDocs.COMMANDS)
export class CommandController {
    constructor(private readonly commandHandler: CommandHandler) {}

    @Get('/')
    @Description('Sends a command to a registered device via query parameters. Validates the operation against the device MIoT spec.')
    @AcceptMime('application/json', 'text/plain')
    @Returns(204)
    @(Returns(200, CommandValueResponse).ContentType('application/json'))
    @(Returns(200, String).ContentType('text/plain'))
    public async commandGet(
        @QueryParams(CommandRequestModel) query: CommandRequestModel,
        @Context() ctx: PlatformContext
    ): Promise<CommandValueResponse | void> {
        return this.commandHandler.execute(query, ctx);
    }

    @Post('/')
    @Description('Sends a command to a registered device. Validates the operation against the device MIoT spec.')
    @AcceptMime('application/json', 'text/plain')
    @Returns(204)
    @(Returns(200, CommandValueResponse).ContentType('application/json'))
    @(Returns(200, String).ContentType('text/plain'))
    public async commandPost(
        @BodyParams(CommandRequestModel) body: CommandRequestModel,
        @Context() ctx: PlatformContext
    ): Promise<CommandValueResponse | void> {
        return this.commandHandler.execute(body, ctx);
    }
}
