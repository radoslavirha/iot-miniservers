import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceCache } from '../models/DeviceCache.js';
import { ConfigService } from './ConfigService.js';
import { DeviceLocalStorageService } from './DeviceLocalStorageService.js';
import { IDeviceStorage } from './IDeviceStorage.js';

/**
 * Facade for device persistence.
 * Selects the active repository at startup based on configuration:
 *  - fallback → DeviceLocalStorageService (local JSON cache)
 *
 * Handlers and other consumers depend only on this service and are unaware of the backend.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceStorageService implements IDeviceStorage {
    private readonly storage: IDeviceStorage;

    constructor(
        readonly config: ConfigService,
        private readonly fileDeviceService: DeviceLocalStorageService
    ) {
        if (config.config.mongodb?.enabled) {
            throw new Error('MongoDB storage is not supported yet.');
        }
        this.storage = this.fileDeviceService;
    }

    getAll(): Promise<DeviceCache[]> {
        return this.storage.getAll();
    }

    getById(deviceId: number): Promise<DeviceCache | undefined> {
        return this.storage.getById(deviceId);
    }

    upsert(device: DeviceCache): Promise<void> {
        return this.storage.upsert(device);
    }
}

