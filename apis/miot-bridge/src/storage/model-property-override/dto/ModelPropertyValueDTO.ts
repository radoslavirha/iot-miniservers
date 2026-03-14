import { AdditionalProperties, Property, Required } from '@tsed/schema';

/**
 * JSON-on-disk shape for a single model property override value.
 */
@AdditionalProperties(false)
export class ModelPropertyValueDTO {
    @Required() @Property(Number) public value: number;
    @Required() @Property(String) public description: string;
}
