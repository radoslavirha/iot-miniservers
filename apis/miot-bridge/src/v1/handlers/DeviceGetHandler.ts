import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { DeviceStorageService } from '../../global/services/DeviceStorageService.js';
import { DeviceGetResponse } from '../models/DeviceGetResponse.js';
import { DeviceV1Mapper } from '../mappers/DeviceV1Mapper.js';
import { SimplifiedMiotSpecV2Mapper } from '../../global/mappers/SimplifiedMiotSpecV2Mapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceGetHandler {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly deviceV1Mapper: DeviceV1Mapper
    ) {}

    async execute(id: string): Promise<DeviceGetResponse> {
        const device = await this.deviceStorageService.getById(id);
        if (!device) {
            throw new NotFound(`Device ${id} not found.`);
        }

        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec);
        return this.deviceV1Mapper.mapCacheToGetResponse(device, spec);
    }
}
