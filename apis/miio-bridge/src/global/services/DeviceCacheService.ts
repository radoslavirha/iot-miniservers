import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceCache } from '../models/DeviceCache.js';
import { ConfigService } from './ConfigService.js';
import { FileDeviceRepository, IDeviceRepository } from '../repositories/index.js';

/**
 * Facade for device persistence.
 * Selects the active repository at startup based on configuration:
 *  - fallback → FileDeviceRepository (local JSON cache)
 *
 * Handlers and other consumers depend only on this service and are unaware of the backend.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceCacheService implements IDeviceRepository {
    private readonly repository: IDeviceRepository;

    constructor(
        private readonly config: ConfigService,
        private readonly fileRepository: FileDeviceRepository
    ) {
        if (config.config.mongodb?.enabled) {
            throw new Error('MongoDB storage is not supported yet.');
        }
        this.repository = this.fileRepository;
    }

    getAll(): Promise<DeviceCache[]> {
        return this.repository.getAll();
    }

    getById(deviceId: number): Promise<DeviceCache | undefined> {
        return this.repository.getById(deviceId);
    }

    upsert(device: DeviceCache): Promise<void> {
        return this.repository.upsert(device);
    }
}

