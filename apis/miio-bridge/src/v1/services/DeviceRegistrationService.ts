import { Service, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { MiotSpec } from '../../global/miio/spec/index.js';
import { DeviceCacheService } from '../../global/services/DeviceCacheService.js';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { MiioService } from '../../global/miio/MiioService.js';

@Service()
@Scope(ProviderScope.SINGLETON)
export class DeviceRegistrationService {
    constructor(
        private readonly miioService: MiioService,
        private readonly deviceCacheService: DeviceCacheService
    ) {}

    /**
     * Runs a handshake, fetches the MIoT spec, persists the device and returns the response model.
     */
    async persist(request: DeviceRequestModel): Promise<DeviceResponseModel> {
        const { deviceId, stamp } = await this.miioService.handshake(request.address);
        const rawSpec = await MiotSpec.fetchRaw(request.model);
        const deviceSpec = await MiotSpec.parseSpec(rawSpec);

        await this.deviceCacheService.upsert({
            deviceId,
            address: request.address,
            token: request.token,
            stamp,
            model: request.model,
            spec: rawSpec
        });

        return CommonUtils.buildModel(DeviceResponseModel, {
            deviceId,
            address: request.address,
            model: request.model,
            spec: deviceSpec,
            specURL: MiotSpec.specUrl(deviceSpec.type)
        });
    }
}
