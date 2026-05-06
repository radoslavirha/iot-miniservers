import { Model } from '@tsed/mongoose';
import { CollectionOf, Enum, Property, Required } from '@tsed/schema';
import { BaseMongo } from '@radoslavirha/tsed-mongoose';
import { ModelPropertyOverrideAccessMongoDTO } from './ModelPropertyOverrideAccessMongoDTO.enum.js';
import { ModelPropertyValueMongoDTO } from './ModelPropertyValueMongoDTO.js';

/**
 * Mongoose document schema for the model property override collection.
 */
@Model({ collection: 'model-property-overrides', schemaOptions: { timestamps: true, versionKey: false } })
export class ModelPropertyOverrideMongoDTO extends BaseMongo {
    /** Device model this override applies to (e.g. xiaomi.vacuum.c102gl). */
    @Required() @Property(String) public modelName: string;
    /** Command key segment used in the spec map (e.g. turbo-fan). */
    @Required() @Property(String) public key: string;
    /** Service instance ID. */
    @Required() @Property(Number) public siid: number;
    /** Property instance ID. */
    @Required() @Property(Number) public piid: number;
    /** Access modes for the property. */
    @Required() @Enum(ModelPropertyOverrideAccessMongoDTO) @CollectionOf(String) public access: ModelPropertyOverrideAccessMongoDTO[];
    /** Allowed values for this property. */
    @Required() @CollectionOf(ModelPropertyValueMongoDTO) public values: ModelPropertyValueMongoDTO[];
}
