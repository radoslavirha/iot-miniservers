import { AdditionalProperties, CollectionOf, Description, Enum, Groups, Property, Required } from '@tsed/schema';
import { PropertyAccess } from './PropertyAccess.enum.js';
import { MiotPropertyValue } from './MiotPropertyValue.js';
import { GROUP_NEVER_SIMPLIFIED_SPEC } from '../../ModelGroups.js';
import {
    MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE,
    MIOT_PROPERTY_SOURCE_VALUE_SPEC,
    type MiotPropertySource
} from '../../otel/telemetry.js';

/**
 * MIoT Property (global)
 */
@Description('A single property of a MIoT service')
@AdditionalProperties(false)
export class MiotProperty {
    @Required()
    @Property(Number)
    @Description('Service instance ID')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public siid: number;

    @Required()
    @Property(Number)
    @Description('Property instance ID')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public piid: number;

    @Required()
    @CollectionOf(PropertyAccess)
    @Description('Access modes for the property (read, write, notify)')
    public access: PropertyAccess[];

    @Required()
    @CollectionOf(MiotPropertyValue)
    @Description('Allowed values for the property')
    public values: MiotPropertyValue[];

    /**
     * Whether this entry came from the device's published spec or from a `ModelPropertyOverride`.
     *
     * Set by `SimplifiedMiotSpecV2Mapper`, which is the only place that can know: it builds the map
     * from `rawSpec` first and then lets overrides `set()` over it, so the winner of a collision is
     * decided there and nowhere else. Reconstructing it later — by re-reading the override list at
     * the call site — would get a *replaced* published property wrong, because the key exists in
     * both.
     *
     * Hidden from the simplified-spec API response like siid/piid: it is provenance for telemetry,
     * and adding it to the payload would change a published contract for no caller that asked.
     */
    @Required()
    @Enum(MIOT_PROPERTY_SOURCE_VALUE_SPEC, MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE)
    @Description('Whether the entry came from the published spec or from a model property override')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public source: MiotPropertySource;
}
