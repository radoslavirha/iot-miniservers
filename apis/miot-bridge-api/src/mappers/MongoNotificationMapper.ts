import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { MongoMapper, MongoCreate } from '@radoslavirha/tsed-mongoose';
import { DeviceNotification } from '../models/notifications/DeviceNotification.js';
import { DeviceNotificationMongoDTO } from '../storage/notification-mongo/dto/DeviceNotificationMongoDTO.js';

/**
 * Bi-directional mapper between DeviceNotificationMongoDTO (MongoDB document) and DeviceNotification (domain model).
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MongoNotificationMapper extends MongoMapper<DeviceNotificationMongoDTO, DeviceNotification> {
    protected mongo = DeviceNotificationMongoDTO;
    protected model = DeviceNotification;

    public mongoToModel(mongo: DeviceNotificationMongoDTO): DeviceNotification {
        return CommonUtils.buildModelStrict(DeviceNotification, {
            ...this.mongoToModelBase(mongo),
            deviceId: mongo.deviceId,
            property: mongo.property
        });
    }

    public buildMongoCreate(entity: Omit<DeviceNotification, 'id' | 'createdAt' | 'updatedAt'>): MongoCreate<DeviceNotificationMongoDTO> {
        return this.buildMongoPayload({
            deviceId: entity.deviceId,
            property: entity.property
        });
    }
}
