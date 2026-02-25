import { AdditionalProperties, CollectionOf, Description, Enum, Optional, Property, Required } from '@tsed/schema';
import { MiotSpecV2PropertyAccess } from './MiotSpecV2PropertyAccess.enum.js';
import { MiotSpecV2PropertyFormat } from './MiotSpecV2PropertyFormat.enum.js';
import { MiotSpecV2PropertyValue } from './MiotSpecV2PropertyValue.js';

/**
 * Raw MIoT spec service property — plain domain model, 1:1 with MiotSpecV2ServicePropertyDTO.
 */
@Description('A single property within a MIoT service.')
@AdditionalProperties(false)
export class MiotSpecV2ServiceProperty {
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
    @Enum(MiotSpecV2PropertyFormat)
    @Description('Value format')
    public format: MiotSpecV2PropertyFormat;

    @Required()
    @CollectionOf(String)
    @Enum(MiotSpecV2PropertyAccess)
    @Description('Access modes')
    public access: MiotSpecV2PropertyAccess[];

    @Optional()
    @Property(String)
    @Description('Optional unit string')
    public unit?: string;

    @Optional()
    @CollectionOf(MiotSpecV2PropertyValue)
    @Description('Allowed discrete values')
    public valueList?: MiotSpecV2PropertyValue[];

    @Optional()
    @CollectionOf(Number)
    @Description('Allowed value range [min, max, step]')
    public valueRange?: number[];

    @Optional()
    @CollectionOf(String)
    @Description('GATT access modes (BLE only)')
    public gattAccess?: string[];
}
