import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { DeviceCache } from '../models/DeviceCache.js';
import { DeviceLocalStorageDTO } from '../storage/device-local-storage/dto/DeviceLocalStorageDTO.js';
import { MiotSpecV2Mapper } from './MiotSpecV2Mapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class FileDeviceMapper extends MappingUtils {
    constructor(private readonly miotSpecV2Mapper: MiotSpecV2Mapper) {
        super();
    }

    public async mapDTOToModel(dto: DeviceLocalStorageDTO): Promise<DeviceCache> {
        return CommonUtils.buildModelStrict(DeviceCache, {
            id: dto.id,
            deviceId: dto.deviceId,
            address: dto.address,
            token: dto.token,
            stamp: dto.stamp,
            model: dto.model,
            specURL: dto.specURL,
            rawSpec: await this.miotSpecV2Mapper.mapDTOToModel(dto.rawSpec),
            stampUpdatedAt: dto.stampUpdatedAt,
            createdAt: dto.createdAt,
            updatedAt: dto.updatedAt
        });
    }

    public async mapModelToCreateDTO(entity: Omit<DeviceCache, 'id' | 'createdAt' | 'updatedAt'>): Promise<Omit<DeviceLocalStorageDTO, 'id' | 'createdAt' | 'updatedAt'>> {
        return CommonUtils.buildModelCore(DeviceLocalStorageDTO, {
            deviceId: entity.deviceId,
            address: entity.address,
            token: entity.token,
            stamp: entity.stamp,
            model: entity.model,
            specURL: entity.specURL,
            rawSpec: await this.miotSpecV2Mapper.mapModelToDTO(entity.rawSpec),
            stampUpdatedAt: entity.stampUpdatedAt
        });
    }

    public async mapModelToDTO(entity: DeviceCache): Promise<DeviceLocalStorageDTO> {
        return CommonUtils.buildModelStrict(DeviceLocalStorageDTO, {
            id: entity.id,
            deviceId: entity.deviceId,
            address: entity.address,
            token: entity.token,
            stamp: entity.stamp,
            model: entity.model,
            specURL: entity.specURL,
            rawSpec: await this.miotSpecV2Mapper.mapModelToDTO(entity.rawSpec),
            stampUpdatedAt: entity.stampUpdatedAt,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt
        });
    }
}
