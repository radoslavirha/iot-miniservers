import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceNotificationCache } from '../models/DeviceNotificationCache.js';
import { NotificationLocalStorageService } from './NotificationLocalStorageService.js';

/**
 * Facade for notification subscription persistence.
 * Selects the active repository at startup based on configuration:
 *  - fallback → NotificationLocalStorageService (local JSON cache)
 *
 * Handlers depend only on this service and are unaware of the backend.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationStorageService {
    private readonly storage: NotificationLocalStorageService;

    constructor(private readonly fileNotificationService: NotificationLocalStorageService) {
        this.storage = this.fileNotificationService;
    }

    getAll(): Promise<DeviceNotificationCache[]> {
        return this.storage.getAll();
    }

    getById(id: string): Promise<DeviceNotificationCache | undefined> {
        return this.storage.getById(id);
    }

    getAllByDeviceId(deviceId: string): Promise<DeviceNotificationCache[]> {
        return this.storage.getAllByDeviceId(deviceId);
    }

    create(notification: Omit<DeviceNotificationCache, 'id'>): Promise<DeviceNotificationCache> {
        return this.storage.create(notification);
    }

    deleteById(id: string): Promise<void> {
        return this.storage.deleteById(id);
    }

    deleteAllByDeviceId(deviceId: string): Promise<void> {
        return this.storage.deleteAllByDeviceId(deviceId);
    }
}
