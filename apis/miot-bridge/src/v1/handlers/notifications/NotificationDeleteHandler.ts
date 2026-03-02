import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { Forbidden, NotFound } from '@tsed/exceptions';
import { DevicePropertyPollerService } from '../../../global/services/DevicePropertyPollerService.js';
import { NotificationStorageService } from '../../../global/services/NotificationStorageService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationDeleteHandler {
    constructor(
        private readonly notificationStorageService: NotificationStorageService,
        private readonly devicePropertyPollerService: DevicePropertyPollerService
    ) {}

    async execute(deviceId: string, id: string): Promise<void> {
        const notification = await this.notificationStorageService.getById(id);
        if (!notification) {
            throw new NotFound(`Notification ${id} not found.`);
        }
        if (notification.deviceId !== deviceId) {
            throw new Forbidden(`Notification ${id} does not belong to device ${deviceId}.`);
        }
        await this.notificationStorageService.deleteById(id);
        this.devicePropertyPollerService.removeSubscription(deviceId, notification.property);
    }
}
