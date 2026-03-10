import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { MongoCreate } from '@radoslavirha/tsed-mongoose';
import { DeviceNotificationCache } from '../models/DeviceNotificationCache.js';
import { DeviceNotificationMongoDTO } from '../storage/notification-mongo/dto/DeviceNotificationMongoDTO.js';

/**
 * Bi-directional mapper between DeviceNotificationMongoDTO (MongoDB document) and DeviceNotificationCache (domain model).
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MongoNotificationMapper extends MappingUtils {
    public mapDTOToModel(dto: DeviceNotificationMongoDTO): DeviceNotificationCache {
        return CommonUtils.buildModel(DeviceNotificationCache, {
            id: dto._id,
            deviceId: dto.deviceId,
            property: dto.property
        });
    }

    public mapModelToCreateObj(entity: Omit<DeviceNotificationCache, 'id'>): MongoCreate<DeviceNotificationMongoDTO> {
        return {
            deviceId: entity.deviceId,
            property: entity.property
        };
    }
}
