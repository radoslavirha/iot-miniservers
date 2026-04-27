import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, DefaultsUtil } from '@radoslavirha/utils';
import { Serializer } from '@radoslavirha/tsed-common';
import { MongoMapper, MongoCreate, MongoUpdate } from '@radoslavirha/tsed-mongoose';
import { DeviceCache } from '../models/DeviceCache.js';
import { DeviceMongoDTO } from '../storage/device-mongo/dto/DeviceMongoDTO.js';
import { MiotSpecV2Mapper } from './MiotSpecV2Mapper.js';
import { MiotSpecV2DTO } from '../endpoints/miot-spec-v2/dto/MiotSpecV2DTO.js';

/**
 * Bi-directional mapper between DeviceMongoDTO (MongoDB document) and DeviceCache (domain model).
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MongoDeviceMapper extends MongoMapper<DeviceMongoDTO, DeviceCache> {
    protected mongo = DeviceMongoDTO;
    protected model = DeviceCache;

    @Inject(MiotSpecV2Mapper)
    private miotSpecV2Mapper: MiotSpecV2Mapper;

    public async mongoToModel(mongo: DeviceMongoDTO): Promise<DeviceCache> {
        const specDto = Serializer.deserialize<MiotSpecV2DTO>(mongo.rawSpec as object, MiotSpecV2DTO);
        return CommonUtils.buildModelStrict(DeviceCache, {
            ...this.mongoToModelBase(mongo),
            deviceId: mongo.deviceId,
            address: mongo.address,
            token: mongo.token,
            stamp: mongo.stamp,
            model: mongo.model,
            specURL: mongo.specURL,
            rawSpec: await this.miotSpecV2Mapper.mapDTOToModel(specDto),
            stampUpdatedAt: DefaultsUtil.number(mongo.stampUpdatedAt, 0)
        });
    }

    public async buildMongoCreate(entity: Omit<DeviceCache, 'id' | 'createdAt' | 'updatedAt'>): Promise<MongoCreate<DeviceMongoDTO>> {
        const rawSpec = await this.miotSpecV2Mapper.mapModelToDTO(entity.rawSpec);
        return this.buildMongoPayload({
            deviceId: entity.deviceId,
            address: entity.address,
            token: entity.token,
            stamp: entity.stamp,
            model: entity.model,
            specURL: entity.specURL,
            rawSpec: Serializer.serialize(rawSpec, MiotSpecV2DTO),
            stampUpdatedAt: DefaultsUtil.number(entity.stampUpdatedAt, 0)
        });
    }

    public async buildMongoUpdate(entity: DeviceCache): Promise<MongoUpdate<DeviceMongoDTO>> {
        const rawSpec = await this.miotSpecV2Mapper.mapModelToDTO(entity.rawSpec);
        return this.buildMongoUpdatePayload({
            deviceId: entity.deviceId,
            address: entity.address,
            token: entity.token,
            stamp: entity.stamp,
            model: entity.model,
            specURL: entity.specURL,
            rawSpec: Serializer.serialize(rawSpec, MiotSpecV2DTO),
            stampUpdatedAt: DefaultsUtil.number(entity.stampUpdatedAt, 0)
        });
    }
}
