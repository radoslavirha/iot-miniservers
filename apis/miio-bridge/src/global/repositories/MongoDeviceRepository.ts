import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CachedDevice, IDeviceRepository } from './IDeviceRepository.js';

/**
 * MongoDB-backed device repository.
 * TODO: Implement using a MongoDB client (e.g. mongoose or the native driver).
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MongoDeviceRepository implements IDeviceRepository {
    getAll(): Promise<CachedDevice[]> {
        throw new Error('MongoDB storage is not supported yet.');
    }

    getById(): Promise<CachedDevice | undefined> {
        throw new Error('MongoDB storage is not supported yet.');
    }

    upsert(): Promise<void> {
        throw new Error('MongoDB storage is not supported yet.');
    }
}
