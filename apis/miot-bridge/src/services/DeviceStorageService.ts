import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceCache } from '../models/DeviceCache.js';
import { ConfigService } from './ConfigService.js';
import { DeviceLocalStorageService } from './DeviceLocalStorageService.js';
import { ObjectUtils } from '@radoslavirha/utils';

/**
 * Facade for device persistence.
 * Selects the active repository at startup based on configuration:
 *  - fallback → DeviceLocalStorageService (local JSON cache)
 *
 * Handlers and other consumers depend only on this service and are unaware of the backend.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceStorageService {
    private readonly storage: DeviceLocalStorageService;

    constructor(
        readonly config: ConfigService,
        private readonly fileDeviceService: DeviceLocalStorageService
    ) {
        if (ObjectUtils.isEnabled(config.config.mongodb)) {
            throw new Error('MongoDB storage is not supported yet.');
        }
        this.storage = this.fileDeviceService;
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

    upsert(device: DeviceCache): Promise<DeviceCache> {
        return this.storage.upsert(device);
    }

    delete(id: string): Promise<void> {
        return this.storage.delete(id);
    }
}

