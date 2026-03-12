import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { DeviceStorageService } from '../../services/DeviceStorageService.js';
import { NotificationDeleteAllHandler } from '../notifications/NotificationDeleteAllHandler.js';
import { CommonUtils } from '@radoslavirha/utils';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceDeleteHandler {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly notificationDeleteAllHandler: NotificationDeleteAllHandler
    ) {}

    async execute(id: string): Promise<void> {
        const device = await this.deviceStorageService.getById(id);
        if (CommonUtils.isNil(device)) {
            throw new NotFound(`Device ${id} not found.`);
        }
        await this.notificationDeleteAllHandler.execute(id);
        await this.deviceStorageService.delete(id);
    }
}
