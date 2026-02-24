import { AdditionalProperties, CollectionOf, Description, Groups, Optional, Property, Required } from '@tsed/schema';
import { GROUP_NEVER_SIMPLIFIED_SPEC } from '../../../global/Groups.js';

/**
 * MIoT Action (v1)
 */
@Description('A single action of a MIoT service')
@AdditionalProperties(false)
export class MiotAction {
    @Required()
    @Property(Number)
    @Description('Service instance ID')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public siid: number;

    @Required()
    @Property(Number)
    @Description('Action instance ID')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public aiid: number;

    @Optional()
    @CollectionOf(Number)
    @Description('Input parameter PIIDs for the action')
    public in?: number[];
}
