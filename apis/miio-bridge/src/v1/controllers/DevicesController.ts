import { Controller, Scope, ProviderScope } from '@tsed/di';
import { BodyParams } from '@tsed/platform-params';
import { Description, Post, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { DeviceDiscoveryHandler } from '../handlers/DeviceDiscoveryHandler.js';
import { DeviceRegisterHandler } from '../handlers/DeviceRegisterHandler.js';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { GROUP_SIMPLIFIED_SPEC } from '../../global/ModelGroups.js';

@Description('Endpoints for miio device discovery and registration.')
@Controller('/devices')
@Scope(ProviderScope.SINGLETON)
@Docs('v1')
export class DevicesController {
    constructor(
        private readonly discoveryHandler: DeviceDiscoveryHandler,
        private readonly registerHandler: DeviceRegisterHandler
    ) {}

    @Post('/discover')
    @Description('Sends a handshake to the device and returns its capabilities via MIoT spec. Does not persist anything.')
    @(Returns(200, DeviceResponseModel).Groups(GROUP_SIMPLIFIED_SPEC))
    async discover(
        @BodyParams(DeviceRequestModel) body: DeviceRequestModel
    ): Promise<DeviceResponseModel> {
        return this.discoveryHandler.execute(body);
    }

    @Post('/register')
    @Description('Registers a device: performs handshake, fetches MIoT spec and persists the device to cache.')
    @(Returns(201, DeviceResponseModel).Groups(GROUP_SIMPLIFIED_SPEC))
    async register(
        @BodyParams(DeviceRequestModel) body: DeviceRequestModel
    ): Promise<DeviceResponseModel> {
        return this.registerHandler.execute(body);
    }

}
