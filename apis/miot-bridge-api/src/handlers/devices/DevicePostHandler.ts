import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { Conflict } from '@tsed/exceptions';
import { DeviceStorageService } from '../../services/DeviceStorageService.js';
import { DeviceRequest } from '../../models/DeviceRequest.js';
import { DevicePostResponse } from '../../models/DevicePostResponse.js';
import { DeviceDiscoveryService } from '../../services/DeviceDiscoveryService.js';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCache } from '../../models/DeviceCache.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DevicePostHandler {
    constructor(
        private readonly deviceDiscoveryService: DeviceDiscoveryService,
        private readonly deviceStorageService: DeviceStorageService
    ) {}

    async execute(request: DeviceRequest): Promise<DevicePostResponse> {
        const { deviceId, stamp, specUrl, rawSpec, deviceSpec } = await this.deviceDiscoveryService.discover(request);

        const existing = await this.deviceStorageService.getByDeviceId(deviceId);
        if (CommonUtils.notNil(existing)) {
            throw new Conflict(`Device with deviceId ${deviceId} is already registered.`);
        }

        const saved = await this.deviceStorageService.create(
            CommonUtils.buildModelCore(DeviceCache, {
                deviceId: deviceId,
                address: request.address,
                token: request.token,
                stamp: stamp,
                stampUpdatedAt: 0,
                model: request.model,
                specURL: specUrl,
                rawSpec: rawSpec
            })
        );

        return CommonUtils.buildModelStrict(DevicePostResponse, {
            id: saved.id,
            deviceId: saved.deviceId,
            address: saved.address,
            token: saved.token,
            stamp: saved.stamp,
            stampUpdatedAt: saved.stampUpdatedAt,
            model: saved.model,
            specURL: saved.specURL,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
            spec: deviceSpec
        });
    }
}
