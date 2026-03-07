import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { DeviceNotificationCache } from '../models/DeviceNotificationCache.js';
import { DeviceNotification } from '../models/notifications/DeviceNotification.js';

/**
 * Maps DeviceNotificationCache domain models to HTTP notification response models.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationMapper extends MappingUtils {
    mapCacheToNotification(cache: DeviceNotificationCache): DeviceNotification {
        return CommonUtils.buildModel(DeviceNotification, {
            id: cache.id,
            deviceId: cache.deviceId,
            property: cache.property
        });
    }
}
