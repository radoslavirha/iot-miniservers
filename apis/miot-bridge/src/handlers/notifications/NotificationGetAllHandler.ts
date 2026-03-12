import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { NotificationStorageService } from '../../services/NotificationStorageService.js';
import { NotificationMapper } from '../../mappers/NotificationMapper.js';
import { DeviceNotificationsResponse } from '../../models/notifications/DeviceNotificationsResponse.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationGetAllHandler {
    constructor(
        private readonly notificationStorageService: NotificationStorageService,
        private readonly notificationMapper: NotificationMapper
    ) {}

    async execute(deviceId: string): Promise<DeviceNotificationsResponse> {
        const caches = await this.notificationStorageService.getAllByDeviceId(deviceId);

        return CommonUtils.buildModelStrict(DeviceNotificationsResponse, {
            notifications: caches.map(c => this.notificationMapper.mapCacheToNotification(c))
        });
    }
}
