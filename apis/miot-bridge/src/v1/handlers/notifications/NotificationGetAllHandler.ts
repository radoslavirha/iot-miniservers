import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { NotificationStorageService } from '../../../global/services/NotificationStorageService.js';
import { NotificationV1Mapper } from '../../mappers/NotificationV1Mapper.js';
import { DeviceNotificationsResponse } from '../../models/notifications/DeviceNotificationsResponse.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationGetAllHandler {
    constructor(
        private readonly notificationStorageService: NotificationStorageService,
        private readonly notificationV1Mapper: NotificationV1Mapper
    ) {}

    async execute(deviceId: string): Promise<DeviceNotificationsResponse> {
        const caches = await this.notificationStorageService.getAllByDeviceId(deviceId);

        return CommonUtils.buildModel(DeviceNotificationsResponse, {
            notifications: caches.map(c => this.notificationV1Mapper.mapCacheToNotification(c))
        });
    }
}
