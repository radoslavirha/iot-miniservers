import { Controller, Scope, ProviderScope } from '@tsed/di';
import { BodyParams, PathParams } from '@tsed/platform-params';
import { Delete, Description, Get, Post, Required, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { DeviceDiscoveryHandler } from '../handlers/DeviceDiscoveryHandler.js';
import { DeviceDeleteHandler } from '../handlers/DeviceDeleteHandler.js';
import { DeviceGetAllHandler } from '../handlers/DeviceGetAllHandler.js';
import { DeviceGetHandler } from '../handlers/DeviceGetHandler.js';
import { DevicePostHandler } from '../handlers/DevicePostHandler.js';
import { DeviceDiscoverRequest } from '../models/DeviceDiscoverRequest.js';
import { DeviceDiscoverResponse } from '../models/DeviceDiscoverResponse.js';
import { DeviceGetResponse } from '../models/DeviceGetResponse.js';
import { DevicesGetResponse } from '../models/DevicesGetResponse.js';
import { DevicePostResponse } from '../models/DevicePostResponse.js';
import { DeviceRequest } from '../models/DeviceRequest.js';
import { GROUP_SIMPLIFIED_SPEC } from '../ModelGroups.js';
import { SwaggerDocs } from '../models/SwaggerDocs.enum.js';
import { DeviceNotificationsController } from './DeviceNotificationsController.js';

@Description('Endpoints for miot device discovery, registration and management.')
@Controller({ path: '/devices', children: [DeviceNotificationsController] })
@Scope(ProviderScope.SINGLETON)
@Docs(SwaggerDocs.DEVICES)
export class DevicesController {
    constructor(
        private readonly discoveryHandler: DeviceDiscoveryHandler,
        private readonly devicePostHandler: DevicePostHandler,
        private readonly deviceGetAllHandler: DeviceGetAllHandler,
        private readonly deviceGetHandler: DeviceGetHandler,
        private readonly deviceDeleteHandler: DeviceDeleteHandler
    ) {}

    @Post('/discover')
    @Description('Sends a handshake to the device and returns its capabilities via MIoT spec. Does not persist anything.')
    @(Returns(200, DeviceDiscoverResponse).Groups(GROUP_SIMPLIFIED_SPEC))
    async discover(
        @Required() @BodyParams(DeviceDiscoverRequest) body: DeviceDiscoverRequest
    ): Promise<DeviceDiscoverResponse> {
        return this.discoveryHandler.execute(body);
    }

    @Post('/')
    @Description('Registers a device: performs handshake, fetches MIoT spec and persists the device to cache.')
    @(Returns(201, DevicePostResponse).Groups(GROUP_SIMPLIFIED_SPEC))
    async register(
        @Required() @BodyParams(DeviceRequest) body: DeviceRequest
    ): Promise<DevicePostResponse> {
        return this.devicePostHandler.execute(body);
    }

    @Get('/')
    @Description('Returns all registered devices.')
    @(Returns(200, DevicesGetResponse).Groups(GROUP_SIMPLIFIED_SPEC))
    async getAll(): Promise<DevicesGetResponse> {
        return this.deviceGetAllHandler.execute();
    }

    @Get('/:deviceId')
    @Description('Returns a registered device by its application-level UUID.')
    @(Returns(200, DeviceGetResponse).Groups(GROUP_SIMPLIFIED_SPEC))
    async get(
        @PathParams('deviceId') id: string
    ): Promise<DeviceGetResponse> {
        return this.deviceGetHandler.execute(id);
    }

    @Delete('/:deviceId')
    @Description('Deletes a registered device from the cache.')
    @Returns(204)
    async delete(
        @PathParams('deviceId') id: string
    ): Promise<void> {
        return this.deviceDeleteHandler.execute(id);
    }
}

