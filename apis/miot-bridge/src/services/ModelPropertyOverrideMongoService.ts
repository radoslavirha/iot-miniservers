import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import { ModelPropertyOverrideMongoRepository } from '../storage/model-property-override-mongo/ModelPropertyOverrideMongoRepository.js';
import { MongoModelPropertyOverrideMapper } from '../mappers/MongoModelPropertyOverrideMapper.js';

/**
 * Orchestration service for MongoDB-backed model property override storage.
 * Bridges ModelPropertyOverrideMongoRepository (DTO level) with domain model using MongoModelPropertyOverrideMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideMongoService {
    @Inject(ModelPropertyOverrideMongoRepository)
    private repository: ModelPropertyOverrideMongoRepository;

    @Inject(MongoModelPropertyOverrideMapper)
    private mapper: MongoModelPropertyOverrideMapper;

    public async getAll(): Promise<ModelPropertyOverride[]> {
        const dtos = await this.repository.findAll();
        return Promise.all(dtos.map(dto => this.mapper.mongoToModel(dto)));
    }

    public async getByModel(model: string): Promise<ModelPropertyOverride[]> {
        const dtos = await this.repository.findByModel(model);
        return Promise.all(dtos.map(dto => this.mapper.mongoToModel(dto)));
    }

    public async create(override: Omit<ModelPropertyOverride, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelPropertyOverride> {
        const dto = await this.repository.create(await this.mapper.buildMongoCreate(override));
        return this.mapper.mongoToModel(dto);
    }

    public async delete(id: string): Promise<void> {
        await this.repository.deleteById(id);
    }
}
