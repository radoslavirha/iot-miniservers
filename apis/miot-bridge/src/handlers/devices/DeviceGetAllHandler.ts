import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceStorageService } from '../../services/DeviceStorageService.js';
import { DevicesGetResponse } from '../../models/DevicesGetResponse.js';
import { DeviceMapper } from '../../mappers/DeviceMapper.js';
import { SimplifiedMiotSpecV2Mapper } from '../../mappers/SimplifiedMiotSpecV2Mapper.js';
import { ModelPropertyOverrideService } from '../../services/ModelPropertyOverrideService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceGetAllHandler {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly deviceMapper: DeviceMapper,
        private readonly modelPropertyOverrideService: ModelPropertyOverrideService
    ) {}

    async execute(): Promise<DevicesGetResponse> {
        const devices = await this.deviceStorageService.getAll();

        const mapped = await Promise.all(devices.map(async device => {
            const overrides = await this.modelPropertyOverrideService.getByModel(device.model);
            const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec, overrides);
            return this.deviceMapper.mapCacheToDeviceWithSpec(device, spec);
        }));

        return CommonUtils.buildModelStrict(DevicesGetResponse, { devices: mapped });
    }
}
