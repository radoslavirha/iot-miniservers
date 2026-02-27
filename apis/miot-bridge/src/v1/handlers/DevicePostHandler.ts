import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { Conflict } from '@tsed/exceptions';
import { DeviceStorageService } from '../../global/services/DeviceStorageService.js';
import { DeviceRequest } from '../models/DeviceRequest.js';
import { DevicePostResponse } from '../models/DevicePostResponse.js';
import { DeviceDiscoveryService } from '../services/DeviceDiscoveryService.js';
import { DeviceV1Mapper } from '../mappers/DeviceV1Mapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DevicePostHandler {
    constructor(
        private readonly deviceDiscoveryService: DeviceDiscoveryService,
        private readonly deviceStorageService: DeviceStorageService,
        private readonly deviceV1Mapper: DeviceV1Mapper
    ) {}

    async execute(request: DeviceRequest): Promise<DevicePostResponse> {
        const { deviceId, stamp, specUrl, rawSpec, deviceSpec } = await this.deviceDiscoveryService.discover(request);

        const existing = await this.deviceStorageService.getByDeviceId(deviceId);
        if (existing) {
            throw new Conflict(`Device with deviceId ${deviceId} is already registered.`);
        }

        const saved = await this.deviceStorageService.upsert(
            this.deviceV1Mapper.buildCache({ deviceId, address: request.address, token: request.token, stamp, model: request.model, specURL: specUrl, rawSpec })
        );

        return this.deviceV1Mapper.mapCacheToPostResponse(saved, deviceSpec);
    }
}
