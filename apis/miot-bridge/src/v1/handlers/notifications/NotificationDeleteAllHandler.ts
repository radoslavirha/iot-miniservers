import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DevicePropertyPollerService } from '../../../global/services/DevicePropertyPollerService.js';
import { NotificationStorageService } from '../../../global/services/NotificationStorageService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationDeleteAllHandler {
    constructor(
        private readonly notificationStorageService: NotificationStorageService,
        private readonly devicePropertyPollerService: DevicePropertyPollerService
    ) {}

    async execute(deviceId: string): Promise<void> {
        await this.notificationStorageService.deleteAllByDeviceId(deviceId);
        this.devicePropertyPollerService.removeAllSubscriptions(deviceId);
    }
}
