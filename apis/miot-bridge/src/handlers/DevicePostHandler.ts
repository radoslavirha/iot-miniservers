import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { Conflict } from '@tsed/exceptions';
import { DeviceStorageService } from '../services/DeviceStorageService.js';
import { DeviceRequest } from '../models/DeviceRequest.js';
import { DevicePostResponse } from '../models/DevicePostResponse.js';
import { DeviceDiscoveryService } from '../services/DeviceDiscoveryService.js';
import { DeviceMapper } from '../mappers/DeviceMapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DevicePostHandler {
    constructor(
        private readonly deviceDiscoveryService: DeviceDiscoveryService,
        private readonly deviceStorageService: DeviceStorageService,
        private readonly deviceMapper: DeviceMapper
    ) {}

    async execute(request: DeviceRequest): Promise<DevicePostResponse> {
        const { deviceId, stamp, specUrl, rawSpec, deviceSpec } = await this.deviceDiscoveryService.discover(request);

        const existing = await this.deviceStorageService.getByDeviceId(deviceId);
        if (existing) {
            throw new Conflict(`Device with deviceId ${deviceId} is already registered.`);
        }

        const saved = await this.deviceStorageService.upsert(
            this.deviceMapper.buildCache({ deviceId, address: request.address, token: request.token, stamp, model: request.model, specURL: specUrl, rawSpec })
        );

        return this.deviceMapper.mapCacheToPostResponse(saved, deviceSpec);
    }
}
