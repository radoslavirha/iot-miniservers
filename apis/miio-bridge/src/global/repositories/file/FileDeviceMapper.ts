import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCache } from '../../models/DeviceCache.js';
import { FileDeviceDTO } from './FileDeviceDTO.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class FileDeviceMapper {
    toEntity(dto: FileDeviceDTO): DeviceCache {
        return CommonUtils.buildModel(DeviceCache, {
            deviceId: dto.deviceId,
            address: dto.address,
            token: dto.token,
            stamp: dto.stamp,
            model: dto.model,
            specURL: dto.specURL,
            rawSpec: dto.rawSpec
        });
    }

    toDTO(entity: DeviceCache): FileDeviceDTO {
        return {
            deviceId: entity.deviceId,
            address: entity.address,
            token: entity.token,
            stamp: entity.stamp,
            model: entity.model,
            specURL: entity.specURL,
            rawSpec: entity.rawSpec
        };
    }
}
