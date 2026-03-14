import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import type { MongooseModel } from '@tsed/mongoose';
import { MongoRepository, MongoCreate } from '@radoslavirha/tsed-mongoose';
import { ModelPropertyOverrideMongoDTO } from './dto/ModelPropertyOverrideMongoDTO.js';

/**
 * Raw DTO-level MongoDB repository for model property overrides.
 * Accepts and returns ModelPropertyOverrideMongoDTO objects only.
 * No domain knowledge — mapping is handled by MongoModelPropertyOverrideMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideMongoRepository extends MongoRepository<ModelPropertyOverrideMongoDTO> {
    @Inject(ModelPropertyOverrideMongoDTO) protected model: MongooseModel<ModelPropertyOverrideMongoDTO>;
    protected mongo = ModelPropertyOverrideMongoDTO;

    public async findAll(): Promise<ModelPropertyOverrideMongoDTO[]> {
        const results = await this.model.find({}).lean<ModelPropertyOverrideMongoDTO[]>();
        return this.deserializeArray(results);
    }

    public async findById(id: string): Promise<ModelPropertyOverrideMongoDTO | null> {
        const result = await this.model.findById(id).lean<ModelPropertyOverrideMongoDTO>();
        return this.deserialize(result);
    }

    public async findByModel(model: string): Promise<ModelPropertyOverrideMongoDTO[]> {
        const results = await this.model.find({ model }).lean<ModelPropertyOverrideMongoDTO[]>();
        return this.deserializeArray(results);
    }

    public async create(data: MongoCreate<ModelPropertyOverrideMongoDTO>): Promise<ModelPropertyOverrideMongoDTO> {
        const doc = await this.model.create(data);
        return this.deserialize(this.convertHydratedDocumentToObject(doc));
    }

    public async deleteById(id: string): Promise<void> {
        await this.model.findByIdAndDelete(id);
    }
}
