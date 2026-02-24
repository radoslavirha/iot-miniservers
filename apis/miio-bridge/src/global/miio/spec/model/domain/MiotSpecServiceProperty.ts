import { AdditionalProperties, CollectionOf, Description, Enum, Optional, Property, Required } from '@tsed/schema';
import { PropertyAccess } from './PropertyAccess.enum.js';
import { PropertyFormat } from './PropertyFormat.enum.js';
import { MiotSpecPropertyValue } from './MiotSpecPropertyValue.js';

/**
 * Raw MIoT spec service property — plain domain model, 1:1 with MiotSpecServicePropertyDTO.
 */
@Description('A single property within a MIoT service.')
@AdditionalProperties(false)
export class MiotSpecServiceProperty {
    @Required()
    @Property(Number)
    @Description('Property instance ID')
    public iid: number;

    @Required()
    @Property(String)
    @Description('Full MIoT spec type URN')
    public type: string;

    @Required()
    @Property(String)
    @Description('Human-readable description')
    public description: string;

    @Required()
    @Enum(PropertyFormat)
    @Description('Value format')
    public format: PropertyFormat;

    @Required()
    @CollectionOf(String)
    @Enum(PropertyAccess)
    @Description('Access modes')
    public access: PropertyAccess[];

    @Optional()
    @Property(String)
    @Description('Optional unit string')
    public unit?: string;

    @Optional()
    @CollectionOf(MiotSpecPropertyValue)
    @Description('Allowed discrete values')
    public valueList?: MiotSpecPropertyValue[];

    @Optional()
    @CollectionOf(Number)
    @Description('Allowed value range [min, max, step]')
    public valueRange?: number[];
}
