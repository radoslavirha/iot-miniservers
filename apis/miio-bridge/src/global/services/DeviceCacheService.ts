import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { ConfigService } from './ConfigService.js';
import { FileDeviceRepository, MongoDeviceRepository, CachedDevice, IDeviceRepository } from '../repositories/index.js';

export type { CachedDevice };

/**
 * Facade for device persistence.
 * Selects the active repository at startup based on configuration:
 *  - `mongoUri` set → MongoDeviceRepository
 *  - fallback        → FileDeviceRepository (local JSON cache)
 *
 * Handlers and other consumers depend only on this service and are unaware of the backend.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceCacheService implements IDeviceRepository {
    private readonly repository: IDeviceRepository;

    constructor(
        private readonly config: ConfigService,
        private readonly fileRepository: FileDeviceRepository,
        private readonly mongoRepository: MongoDeviceRepository
    ) {
        if (config.config.mongodb?.enabled) {
            this.repository = this.mongoRepository;
        } else {
            this.repository = this.fileRepository;
        }
    }

    getAll(): Promise<CachedDevice[]> {
        return this.repository.getAll();
    }

    getById(deviceId: number): Promise<CachedDevice | undefined> {
        return this.repository.getById(deviceId);
    }

    upsert(device: CachedDevice): Promise<void> {
        return this.repository.upsert(device);
    }
}

