import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { Forbidden, NotFound } from '@tsed/exceptions';
import { DevicePropertyPollerService } from '../../services/DevicePropertyPollerService.js';
import { NotificationStorageService } from '../../services/NotificationStorageService.js';
import { CommonUtils } from '@radoslavirha/utils';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationDeleteHandler {
    constructor(
        private readonly notificationStorageService: NotificationStorageService,
        private readonly devicePropertyPollerService: DevicePropertyPollerService
    ) {}

    async execute(deviceId: string, id: string): Promise<void> {
        const notification = await this.notificationStorageService.getById(id);
        if (CommonUtils.isNil(notification)) {
            throw new NotFound(`Notification ${id} not found.`);
        }
        if (notification.deviceId !== deviceId) {
            throw new Forbidden(`Notification ${id} does not belong to device ${deviceId}.`);
        }
        await this.notificationStorageService.deleteById(id);
        this.devicePropertyPollerService.removeSubscription(deviceId, notification.property);
    }
}
