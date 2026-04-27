import { Controller, Scope, ProviderScope } from '@tsed/di';
import { BodyParams, Context, QueryParams } from '@tsed/platform-params';
import { PlatformContext } from '@tsed/platform-http';
import { AcceptMime, Description, Get, Post, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { CommandHandler } from '../handlers/CommandHandler.js';
import { RawCommandHandler } from '../handlers/RawCommandHandler.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { RawCommandRequestModel } from '../models/RawCommandRequestModel.js';
import { CommandValueResponse } from '../models/CommandValueResponse.js';
import { SwaggerDocs } from '../models/SwaggerDocs.enum.js';

@Description('Endpoint for sending commands (read/write property, execute action) to registered devices.')
@Controller('/command')
@Scope(ProviderScope.SINGLETON)
@Docs(SwaggerDocs.COMMANDS)
export class CommandController {
    constructor(
        private readonly commandHandler: CommandHandler,
        private readonly rawCommandHandler: RawCommandHandler
    ) {}

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

    @Get('/raw')
    @Description('Sends a raw IID command to a registered device via query parameters. Skips spec validation.')
    @AcceptMime('application/json', 'text/plain')
    @Returns(204)
    @(Returns(200, CommandValueResponse).ContentType('application/json'))
    @(Returns(200, String).ContentType('text/plain'))
    public async rawCommandGet(
        @QueryParams(RawCommandRequestModel) query: RawCommandRequestModel,
        @Context() ctx: PlatformContext
    ): Promise<CommandValueResponse | void> {
        return this.rawCommandHandler.execute(query, ctx);
    }

    @Post('/raw')
    @Description('Sends a raw IID command to a registered device. Skips spec validation.')
    @AcceptMime('application/json', 'text/plain')
    @Returns(204)
    @(Returns(200, CommandValueResponse).ContentType('application/json'))
    @(Returns(200, String).ContentType('text/plain'))
    public async rawCommandPost(
        @BodyParams(RawCommandRequestModel) body: RawCommandRequestModel,
        @Context() ctx: PlatformContext
    ): Promise<CommandValueResponse | void> {
        return this.rawCommandHandler.execute(body, ctx);
    }
}
