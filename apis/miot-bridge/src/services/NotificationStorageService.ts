import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceNotificationCache } from '../models/DeviceNotificationCache.js';
import { NotificationLocalStorageService } from './NotificationLocalStorageService.js';
import { DeviceNotificationMongoService } from './DeviceNotificationMongoService.js';
import { ConfigService } from './ConfigService.js';
import { ObjectUtils } from '@radoslavirha/utils';

/**
 * Facade for notification subscription persistence.
 * Selects the active backend at startup based on configuration:
 *  - mongodb.enabled → DeviceNotificationMongoService (MongoDB)
 *  - fallback → NotificationLocalStorageService (local JSON cache)
 *
 * Handlers depend only on this service and are unaware of the backend.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationStorageService {
    private readonly storage: NotificationLocalStorageService | DeviceNotificationMongoService;

    constructor(
        readonly config: ConfigService,
        private readonly fileNotificationService: NotificationLocalStorageService,
        private readonly mongoNotificationService: DeviceNotificationMongoService
    ) {
        this.storage = ObjectUtils.isEnabled(config.config.mongodb)
            ? this.mongoNotificationService
            : this.fileNotificationService;
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
