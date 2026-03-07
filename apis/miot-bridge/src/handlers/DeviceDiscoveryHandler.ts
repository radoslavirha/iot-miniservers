import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceDiscoverRequest } from '../models/DeviceDiscoverRequest.js';
import { DeviceDiscoverResponse } from '../models/DeviceDiscoverResponse.js';
import { DeviceDiscoveryService } from '../services/DeviceDiscoveryService.js';
import { DeviceMapper } from '../mappers/DeviceMapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceDiscoveryHandler {
    constructor(
        private readonly deviceDiscoveryService: DeviceDiscoveryService,
        private readonly deviceMapper: DeviceMapper
    ) {}

    /**
     * Sends a handshake to the device and fetches its MIoT spec.
     * Does NOT persist anything to cache. Useful for ad-hoc inspection.
     */
    async execute(request: DeviceDiscoverRequest): Promise<DeviceDiscoverResponse> {
        const { deviceId, specUrl, deviceSpec } = await this.deviceDiscoveryService.discover(request);

        return this.deviceMapper.mapDiscoveryToDiscoverResponse(
            { deviceId, address: request.address, token: request.token, model: request.model, specURL: specUrl },
            deviceSpec
        );
    }
}
