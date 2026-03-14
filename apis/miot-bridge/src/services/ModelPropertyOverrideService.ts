import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { ObjectUtils } from '@radoslavirha/utils';
import { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import { ConfigService } from './ConfigService.js';
import { ModelPropertyOverrideLocalStorageService } from './ModelPropertyOverrideLocalStorageService.js';
import { ModelPropertyOverrideMongoService } from './ModelPropertyOverrideMongoService.js';

/**
 * Facade for model property override persistence.
 * Selects the active backend at startup based on configuration:
 *  - mongodb.enabled → ModelPropertyOverrideMongoService (MongoDB)
 *  - fallback → ModelPropertyOverrideLocalStorageService (local JSON cache)
 *
 * Handlers and other consumers depend only on this service and are unaware of the backend.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideService {
    private readonly storage: ModelPropertyOverrideLocalStorageService | ModelPropertyOverrideMongoService;

    constructor(
        readonly config: ConfigService,
        private readonly fileService: ModelPropertyOverrideLocalStorageService,
        private readonly mongoService: ModelPropertyOverrideMongoService
    ) {
        this.storage = ObjectUtils.isEnabled(config.config.mongodb)
            ? this.mongoService
            : this.fileService;
    }

    public getAll(): Promise<ModelPropertyOverride[]> {
        return this.storage.getAll();
    }

    public getByModel(model: string): Promise<ModelPropertyOverride[]> {
        return this.storage.getByModel(model);
    }

    public create(override: Omit<ModelPropertyOverride, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelPropertyOverride> {
        return this.storage.create(override);
    }

    public delete(id: string): Promise<void> {
        return this.storage.delete(id);
    }
}
