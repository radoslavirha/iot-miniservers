import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { DeviceInteractionService } from '../services/DeviceInteractionService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceDiscoveryHandler {
    constructor(private readonly deviceInteractionService: DeviceInteractionService) {}

    /**
     * Sends a handshake to the device and fetches its MIoT spec.
     * Does NOT persist anything to cache. Useful for ad-hoc inspection.
     */
    async execute(request: DeviceRequestModel): Promise<DeviceResponseModel> {
        const { deviceId, stamp, specUrl, deviceSpec } = await this.deviceInteractionService.connect(request);

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
