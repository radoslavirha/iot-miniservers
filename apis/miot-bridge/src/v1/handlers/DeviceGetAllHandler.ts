import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceStorageService } from '../../global/services/DeviceStorageService.js';
import { DevicesGetResponse } from '../models/DevicesGetResponse.js';
import { DeviceV1Mapper } from '../mappers/DeviceV1Mapper.js';
import { SimplifiedMiotSpecV2Mapper } from '../../global/mappers/SimplifiedMiotSpecV2Mapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceGetAllHandler {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly deviceV1Mapper: DeviceV1Mapper
    ) {}

    async execute(): Promise<DevicesGetResponse> {
        const devices = await this.deviceStorageService.getAll();

        const mapped = await Promise.all(devices.map(async device => {
            const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec);
            return this.deviceV1Mapper.mapCacheToGetResponse(device, spec);
        }));

        return CommonUtils.buildModel(DevicesGetResponse, { devices: mapped });
    }
}
