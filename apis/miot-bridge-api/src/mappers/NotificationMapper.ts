import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { DeviceNotification } from '../models/notifications/DeviceNotification.js';

/**
 * Maps DeviceNotification domain models to HTTP notification response models.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationMapper extends MappingUtils {
    mapCacheToNotification(notification: DeviceNotification): DeviceNotification {
        return CommonUtils.buildModelStrict(DeviceNotification, {
            id: notification.id,
            deviceId: notification.deviceId,
            property: notification.property,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt
        });
    }
}
