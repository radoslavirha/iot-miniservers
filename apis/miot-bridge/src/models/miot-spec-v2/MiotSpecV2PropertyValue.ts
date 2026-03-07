import { AdditionalProperties, Description, Property, Required } from '@tsed/schema';

/**
 * Raw MIoT spec property value — plain domain model, 1:1 with MiotSpecV2PropertyValueDTO.
 */
@Description('A single allowed value entry for a MIoT spec property.')
@AdditionalProperties(false)
export class MiotSpecV2PropertyValue {
    @Required()
    @Property(Number)
    @Description('Numeric value')
    public value: number;

    @Required()
    @Property(String)
    @Description('Human-readable description of the value')
    public description: string;
}
