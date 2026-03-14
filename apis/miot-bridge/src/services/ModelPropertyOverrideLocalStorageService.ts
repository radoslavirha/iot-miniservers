import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import { ModelPropertyOverrideRepository } from '../storage/model-property-override/ModelPropertyOverrideRepository.js';
import { ModelPropertyOverrideMapper } from '../mappers/ModelPropertyOverrideMapper.js';

/**
 * Orchestration service for file-backed model property override storage.
 * Bridges ModelPropertyOverrideRepository (DTO level) with domain model using ModelPropertyOverrideMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideLocalStorageService {
    @Inject(ModelPropertyOverrideRepository)
    private readonly repository: ModelPropertyOverrideRepository;

    @Inject(ModelPropertyOverrideMapper)
    private readonly mapper: ModelPropertyOverrideMapper;

    public async getAll(): Promise<ModelPropertyOverride[]> {
        const dtos = await this.repository.getAll();
        return Promise.all(dtos.map(dto => this.mapper.mapDTOToModel(dto)));
    }

    public async getByModel(model: string): Promise<ModelPropertyOverride[]> {
        const dtos = await this.repository.getByModel(model);
        return Promise.all(dtos.map(dto => this.mapper.mapDTOToModel(dto)));
    }

    public async create(override: Omit<ModelPropertyOverride, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelPropertyOverride> {
        const dto = await this.repository.create(await this.mapper.mapModelToCreateDTO(override));
        return this.mapper.mapDTOToModel(dto);
    }

    public async delete(id: string): Promise<void> {
        await this.repository.delete(id);
    }
}
