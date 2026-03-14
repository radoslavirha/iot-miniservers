import { AdditionalProperties, CollectionOf, Enum, Property, Required } from '@tsed/schema';
import { ModelPropertyOverrideAccessDTO } from './ModelPropertyOverrideAccessDTO.enum.js';
import { ModelPropertyValueDTO } from './ModelPropertyValueDTO.js';

/**
 * JSON-on-disk shape for file-backed model property override storage.
 */
@AdditionalProperties(false)
export class ModelPropertyOverrideLocalStorageDTO {
    @Required() @Property(String) public id: string;
    @Required() @Property(String) public model: string;
    @Required() @Property(String) public key: string;
    @Required() @Property(Number) public siid: number;
    @Required() @Property(Number) public piid: number;
    @Required() @Enum(ModelPropertyOverrideAccessDTO) @CollectionOf(ModelPropertyOverrideAccessDTO) public access: ModelPropertyOverrideAccessDTO[];
    @Required() @CollectionOf(ModelPropertyValueDTO) public values: ModelPropertyValueDTO[];
    @Required() @Property(Date) public createdAt: Date;
    @Required() @Property(Date) public updatedAt: Date;
}
