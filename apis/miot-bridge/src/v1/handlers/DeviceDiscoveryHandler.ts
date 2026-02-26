import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { DeviceDiscoveryService } from '../services/DeviceDiscoveryService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceDiscoveryHandler {
    constructor(private readonly deviceDiscoveryService: DeviceDiscoveryService) {}

    /**
     * Sends a handshake to the device and fetches its MIoT spec.
     * Does NOT persist anything to cache. Useful for ad-hoc inspection.
     */
    async execute(request: DeviceRequestModel): Promise<DeviceResponseModel> {
        const { deviceId, stamp, specUrl, deviceSpec } = await this.deviceDiscoveryService.discover(request);

        return CommonUtils.buildModel(DeviceResponseModel, {
            deviceId,
            address: request.address,
            token: request.token,
            stamp,
            model: request.model,
            specURL: specUrl,
            spec: deviceSpec
        });
    }
}
