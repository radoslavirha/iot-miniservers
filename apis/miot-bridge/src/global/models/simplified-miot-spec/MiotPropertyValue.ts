import { AdditionalProperties, Description, Property, Required } from '@tsed/schema';

/**
 * MIoT Property value (global)
 */
@Description('A single allowed value for a MIoT property')
@AdditionalProperties(false)
export class MiotPropertyValue {
    @Required()
    @Property(Number)
    @Description('Numeric value')
    public value: number;

    @Required()
    @Property(String)
    @Description('Human-readable description of the value')
    public description: string;
}
