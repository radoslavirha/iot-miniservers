import { AdditionalProperties, CollectionOf, Description, Optional, Property, Required } from '@tsed/schema';
import { MiotSpecServiceAction } from './MiotSpecServiceAction.js';
import { MiotSpecServiceEvent } from './MiotSpecServiceEvent.js';
import { MiotSpecServiceProperty } from './MiotSpecServiceProperty.js';

/**
 * Raw MIoT spec service entry — plain domain model, 1:1 with MiotSpecServiceDTO.
 */
@Description('A single service entry within a MIoT device spec.')
@AdditionalProperties(false)
export class MiotSpecService {
    @Required()
    @Property(Number)
    @Description('Service instance ID')
    public iid: number;

    @Required()
    @Property(String)
    @Description('Full MIoT spec type URN')
    public type: string;

    @Required()
    @Property(String)
    @Description('Human-readable description')
    public description: string;

    @Optional()
    @CollectionOf(MiotSpecServiceProperty)
    @Description('Service properties')
    public properties?: MiotSpecServiceProperty[];

    @Optional()
    @CollectionOf(MiotSpecServiceAction)
    @Description('Service actions')
    public actions?: MiotSpecServiceAction[];

    @Optional()
    @CollectionOf(MiotSpecServiceEvent)
    @Description('Service events')
    public events?: MiotSpecServiceEvent[];
}
