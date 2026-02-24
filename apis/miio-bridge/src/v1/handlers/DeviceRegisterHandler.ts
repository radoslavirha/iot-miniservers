import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCache } from '../../global/models/DeviceCache.js';
import { DeviceStorageService } from '../../global/services/DeviceStorageService.js';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { DeviceInteractionService } from '../services/DeviceInteractionService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceRegisterHandler {
    constructor(
        private readonly deviceInteractionService: DeviceInteractionService,
        private readonly deviceStorageService: DeviceStorageService
    ) {}

    async execute(request: DeviceRequestModel): Promise<DeviceResponseModel> {
        const { deviceId, stamp, specUrl, rawSpec, deviceSpec } = await this.deviceInteractionService.connect(request);

        await this.deviceStorageService.upsert(CommonUtils.buildModel(DeviceCache, {
            deviceId,
            address: request.address,
            token: request.token,
            stamp,
            model: request.model,
            specURL: specUrl,
            rawSpec
        }));

        return CommonUtils.buildModel(DeviceResponseModel, {
            deviceId,
            address: request.address,
            token: request.token,
            stamp,
            model: request.model,
            specURL: specUrl,
            spec: deviceSpec
        });
    }
}
