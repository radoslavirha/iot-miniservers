import { Service, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { MiotSpecV2Endpoint, MiotSpecV2Mapper } from '../../global/miio/spec/index.js';
import { DeviceCache } from '../../global/models/DeviceCache.js';
import { DeviceCacheService } from '../../global/services/DeviceCacheService.js';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { MiioService } from './MiioService.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/index.js';

@Service()
@Scope(ProviderScope.SINGLETON)
export class DeviceRegistrationService {
    constructor(
        private readonly miioService: MiioService,
        private readonly deviceCacheService: DeviceCacheService,
        private readonly miotSpecEndpoint: MiotSpecV2Endpoint,
        private readonly miotSpecMapper: MiotSpecV2Mapper,
        private readonly simplifiedMiotSpecV2Mapper: SimplifiedMiotSpecV2Mapper
    ) {}

    /**
     * Runs a handshake, fetches the MIoT spec, persists the device and returns the response model.
     */
    async persist(request: DeviceRequestModel): Promise<DeviceResponseModel> {
        const { deviceId, stamp } = await this.miioService.handshake(request.address);
        const rawDto = await this.miotSpecEndpoint.fetchRaw(request.model);
        const rawSpec = await this.miotSpecMapper.mapDTOToModel(rawDto);
        const deviceSpec = await this.simplifiedMiotSpecV2Mapper.map(rawSpec);

        await this.deviceCacheService.upsert(CommonUtils.buildModel(DeviceCache, {
            deviceId,
            address: request.address,
            token: request.token,
            stamp,
            model: request.model,
            specURL: this.miotSpecEndpoint.specUrl(rawDto.type),
            rawSpec
        }));

        return CommonUtils.buildModel(DeviceResponseModel, {
            deviceId,
            address: request.address,
            token: request.token,
            stamp,
            model: request.model,
            specURL: this.miotSpecEndpoint.specUrl(rawDto.type),
            spec: deviceSpec
        });
    }
}
