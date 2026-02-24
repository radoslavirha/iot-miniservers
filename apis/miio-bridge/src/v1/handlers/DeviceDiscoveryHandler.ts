import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { MiotSpecV2Endpoint, MiotSpecV2Mapper } from '../../global/miio/spec/index.js';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { MiioService } from '../services/MiioService.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/index.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceDiscoveryHandler {
    constructor(
        private readonly miioService: MiioService,
        private readonly miotSpecEndpoint: MiotSpecV2Endpoint,
        private readonly miotSpecMapper: MiotSpecV2Mapper,
        private readonly simplifiedMiotSpecV2Mapper: SimplifiedMiotSpecV2Mapper
    ) {}

    /**
     * Sends a handshake to the device and fetches its MIoT spec.
     * Does NOT persist anything to cache. Useful for ad-hoc inspection.
     */
    async execute(request: DeviceRequestModel): Promise<DeviceResponseModel> {
        const { deviceId, stamp } = await this.miioService.handshake(request.address);
        const rawDto = await this.miotSpecEndpoint.fetchRaw(request.model);
        const rawSpec = await this.miotSpecMapper.mapDTOToModel(rawDto);
        const deviceSpec = await this.simplifiedMiotSpecV2Mapper.map(rawSpec);

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
