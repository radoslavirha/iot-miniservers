import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceStorageService } from '../../services/DeviceStorageService.js';
import { DeviceGetResponse } from '../../models/DeviceGetResponse.js';
import { DeviceMapper } from '../../mappers/DeviceMapper.js';
import { SimplifiedMiotSpecV2Mapper } from '../../mappers/SimplifiedMiotSpecV2Mapper.js';
import { ModelPropertyOverrideService } from '../../services/ModelPropertyOverrideService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceGetHandler {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly deviceMapper: DeviceMapper,
        private readonly modelPropertyOverrideService: ModelPropertyOverrideService
    ) {}

    async execute(id: string): Promise<DeviceGetResponse> {
        const device = await this.deviceStorageService.getById(id);
        if (CommonUtils.isNil(device)) {
            throw new NotFound(`Device ${id} not found.`);
        }

        const overrides = await this.modelPropertyOverrideService.getByModel(device.model);
        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec, overrides);
        return CommonUtils.buildModelStrict(DeviceGetResponse, {
            ...this.deviceMapper.mapCacheToDeviceWithSpec(device, spec)
        });
    }
}
