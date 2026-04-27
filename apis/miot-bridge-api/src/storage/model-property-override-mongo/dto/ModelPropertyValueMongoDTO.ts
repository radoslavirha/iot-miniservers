import { AdditionalProperties, Property, Required } from '@tsed/schema';

/**
 * Mongoose sub-document shape for a single model property override value.
 */
@AdditionalProperties(false)
export class ModelPropertyValueMongoDTO {
    @Required() @Property(Number) public value: number;
    @Required() @Property(String) public description: string;
}
