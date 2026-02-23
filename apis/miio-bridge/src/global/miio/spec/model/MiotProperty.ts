import { AdditionalProperties, CollectionOf, Description, Groups, Property, Required } from '@tsed/schema';
import { PropertyAccess } from './PropertyAccess.enum.js';
import { MiotPropertyValue } from './MiotPropertyValue.js';
import { GROUP_NEVER_SIMPLIFIED_SPEC } from '../../../Groups.js';

/**
 * MIoT Property
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
}
