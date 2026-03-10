import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { Serializer } from '@radoslavirha/tsed-common';
import { MongoUpdate } from '@radoslavirha/tsed-mongoose';
import { DeviceCache } from '../models/DeviceCache.js';
import { DeviceMongoDTO } from '../storage/device-mongo/dto/DeviceMongoDTO.js';
import { MiotSpecV2Mapper } from './MiotSpecV2Mapper.js';
import { MiotSpecV2DTO } from '../endpoints/miot-spec-v2/dto/MiotSpecV2DTO.js';

/**
 * Bi-directional mapper between DeviceMongoDTO (MongoDB document) and DeviceCache (domain model).
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MongoDeviceMapper extends MappingUtils {
    constructor(private readonly miotSpecV2Mapper: MiotSpecV2Mapper) {
        super();
    }

    public async mapDTOToModel(dto: DeviceMongoDTO): Promise<DeviceCache> {
        const specDto = Serializer.deserialize<MiotSpecV2DTO>(dto.rawSpec as object, MiotSpecV2DTO);
        return CommonUtils.buildModel(DeviceCache, {
            id: dto._id,
            deviceId: dto.deviceId,
            address: dto.address,
            token: dto.token,
            stamp: dto.stamp,
            model: dto.model,
            specURL: dto.specURL,
            rawSpec: await this.miotSpecV2Mapper.mapDTOToModel(specDto),
            stampUpdatedAt: dto.stampUpdatedAt ?? 0
        });
    }

    public async mapModelToUpdateObj(entity: DeviceCache): Promise<MongoUpdate<DeviceMongoDTO>> {
        const rawSpec = await this.miotSpecV2Mapper.mapModelToDTO(entity.rawSpec);
        return {
            deviceId: entity.deviceId,
            address: entity.address,
            token: entity.token,
            stamp: entity.stamp,
            model: entity.model,
            specURL: entity.specURL,
            rawSpec: Serializer.serialize(rawSpec, MiotSpecV2DTO),
            stampUpdatedAt: entity.stampUpdatedAt ?? 0
        };
    }
}
