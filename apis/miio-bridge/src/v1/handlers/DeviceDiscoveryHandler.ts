import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { MiotSpec } from '../../global/miio/spec/index.js';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { MiioService } from '../../global/miio/MiioService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceDiscoveryHandler {
    constructor(
        private readonly miioService: MiioService
    ) {}

    /**
     * Sends a handshake to the device and fetches its MIoT spec.
     * Does NOT persist anything to cache. Useful for ad-hoc inspection.
     */
    async execute(request: DeviceRequestModel): Promise<DeviceResponseModel> {
        const { deviceId } = await this.miioService.handshake(request.address);
        const rawSpec = await MiotSpec.fetchRaw(request.model);
        const deviceSpec = await MiotSpec.parseSpec(rawSpec);

        return CommonUtils.buildModel(DeviceResponseModel, {
            deviceId,
            address: request.address,
            model: request.model,
            spec: deviceSpec,
            specURL: MiotSpec.specUrl(deviceSpec.type)
        });
    }
}
