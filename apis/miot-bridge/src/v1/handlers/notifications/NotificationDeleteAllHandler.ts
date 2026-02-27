import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotificationStorageService } from '../../../global/services/NotificationStorageService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationDeleteAllHandler {
    constructor(private readonly notificationStorageService: NotificationStorageService) {}

    async execute(deviceId: string): Promise<void> {
        await this.notificationStorageService.deleteAllByDeviceId(deviceId);
    }
}
