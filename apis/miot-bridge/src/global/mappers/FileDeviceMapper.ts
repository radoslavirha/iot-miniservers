import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCache } from '../models/DeviceCache.js';
import { DeviceLocalStorageDTO } from '../storage/device-local-storage/dto/DeviceLocalStorageDTO.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class FileDeviceMapper {
    public async mapDTOToModel(dto: DeviceLocalStorageDTO): Promise<DeviceCache> {
        return Promise.resolve(CommonUtils.buildModel(DeviceCache, {
            deviceId: dto.deviceId,
            address: dto.address,
            token: dto.token,
            stamp: dto.stamp,
            model: dto.model,
            specURL: dto.specURL,
            rawSpec: dto.rawSpec,
            stampUpdatedAt: dto.stampUpdatedAt ?? 0
        }));
    }

    public async mapModelToDTO(entity: DeviceCache): Promise<DeviceLocalStorageDTO> {
        return Promise.resolve(CommonUtils.buildModel(DeviceLocalStorageDTO, {
            deviceId: entity.deviceId,
            address: entity.address,
            token: entity.token,
            stamp: entity.stamp,
            model: entity.model,
            specURL: entity.specURL,
            rawSpec: entity.rawSpec,
            stampUpdatedAt: entity.stampUpdatedAt ?? 0
        }));
    }
}
