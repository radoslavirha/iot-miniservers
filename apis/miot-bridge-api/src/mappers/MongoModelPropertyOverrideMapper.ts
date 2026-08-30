import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { MongoMapper, MongoCreate } from '@radoslavirha/tsed-mongoose';
import { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import { ModelPropertyOverrideMongoDTO } from '../storage/model-property-override-mongo/dto/ModelPropertyOverrideMongoDTO.js';
import { ModelPropertyOverrideAccessMongoDTO } from '../storage/model-property-override-mongo/dto/ModelPropertyOverrideAccessMongoDTO.enum.js';
import { MiotPropertyValue } from '../models/simplified-miot-spec/MiotPropertyValue.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';

/**
 * Bi-directional mapper between ModelPropertyOverrideMongoDTO (MongoDB document) and ModelPropertyOverride (domain model).
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MongoModelPropertyOverrideMapper extends MongoMapper<ModelPropertyOverrideMongoDTO, ModelPropertyOverride> {
    protected mongo = ModelPropertyOverrideMongoDTO;
    protected model = ModelPropertyOverride;

    public async mongoToModel(mongo: ModelPropertyOverrideMongoDTO): Promise<ModelPropertyOverride> {
        return CommonUtils.buildModelStrict(ModelPropertyOverride, {
            ...this.mongoToModelBase(mongo),
            model: mongo.modelName,
            key: mongo.key,
            siid: mongo.siid,
            piid: mongo.piid,
            access: await this.mapArray(mongo.access, async (value) => await this.mapEnum({ ModelPropertyOverrideAccessMongoDTO }, { PropertyAccess }, value)),
            values: mongo.values.map(v =>
                CommonUtils.buildModelStrict(MiotPropertyValue, { value: v.value, description: v.description })
            )
        });
    }

    public async buildMongoCreate(entity: Omit<ModelPropertyOverride, 'id' | 'createdAt' | 'updatedAt'>): Promise<MongoCreate<ModelPropertyOverrideMongoDTO>> {
        return this.buildMongoPayload({
            // `modelName`, not `model` — the document field, not the domain field.
            //
            // The rename of `ModelPropertyOverrideMongoDTO.model` to `modelName` moved the DTO,
            // `findByModel`'s query and `mongoToModel` with it and left this one call site behind.
            // Mongoose strips a key absent from the schema, so every override written since was
            // stored with no `modelName` at all, matched `find({ modelName })` never, and vanished
            // from the merged spec — silently, because an unresolvable key is dropped by
            // `DeviceCommandService.getProperties` rather than raised.
            //
            // The type did not catch it and cannot: `buildMongoPayload<D extends MongoCreate<MONGO>>`
            // infers `D` *from* this literal, so there is no assignment to a declared target and no
            // excess property check. Every field in `MongoCreate` is optional on top of that, so a
            // misspelling reads as "field omitted". Only the spec beside this file pins it.
            modelName: entity.model,
            key: entity.key,
            siid: entity.siid,
            piid: entity.piid,
            access: await this.mapArray(entity.access, async (value) => await this.mapEnum({ PropertyAccess }, { ModelPropertyOverrideAccessMongoDTO }, value)),
            values: entity.values.map(v => ({ value: v.value, description: v.description }))
        });
    }
}
