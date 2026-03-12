import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceCache } from '../models/DeviceCache.js';
import { ConfigService } from './ConfigService.js';
import { DeviceLocalStorageService } from './DeviceLocalStorageService.js';
import { DeviceMongoService } from './DeviceMongoService.js';
import { ObjectUtils } from '@radoslavirha/utils';

/**
 * Facade for device persistence.
 * Selects the active backend at startup based on configuration:
 *  - mongodb.enabled → DeviceMongoService (MongoDB)
 *  - fallback → DeviceLocalStorageService (local JSON cache)
 *
 * Handlers and other consumers depend only on this service and are unaware of the backend.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceStorageService {
    private readonly storage: DeviceLocalStorageService | DeviceMongoService;

    constructor(
        readonly config: ConfigService,
        private readonly fileDeviceService: DeviceLocalStorageService,
        private readonly mongoDeviceService: DeviceMongoService
    ) {
        this.storage = ObjectUtils.isEnabled(config.config.mongodb)
            ? this.mongoDeviceService
            : this.fileDeviceService;
    }

    getAll(): Promise<DeviceCache[]> {
        return this.storage.getAll();
    }

    getById(id: string): Promise<DeviceCache | undefined> {
        return this.storage.getById(id);
    }

    getByDeviceId(deviceId: number): Promise<DeviceCache | undefined> {
        return this.storage.getByDeviceId(deviceId);
    }

    create(device: Omit<DeviceCache, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeviceCache> {
        return this.storage.create(device);
    }

    update(device: DeviceCache): Promise<DeviceCache> {
        return this.storage.update(device);
    }

    delete(id: string): Promise<void> {
        return this.storage.delete(id);
    }
}

