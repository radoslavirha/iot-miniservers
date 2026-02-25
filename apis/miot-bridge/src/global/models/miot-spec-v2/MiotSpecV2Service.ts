import { AdditionalProperties, CollectionOf, Description, Optional, Property, Required } from '@tsed/schema';
import { MiotSpecV2ServiceAction } from './MiotSpecV2ServiceAction.js';
import { MiotSpecV2ServiceEvent } from './MiotSpecV2ServiceEvent.js';
import { MiotSpecV2ServiceProperty } from './MiotSpecV2ServiceProperty.js';

/**
 * Raw MIoT spec service entry — plain domain model, 1:1 with MiotSpecV2ServiceDTO.
 */
@Description('A single service entry within a MIoT device spec.')
@AdditionalProperties(false)
export class MiotSpecV2Service {
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
    @CollectionOf(MiotSpecV2ServiceProperty)
    @Description('Service properties')
    public properties?: MiotSpecV2ServiceProperty[];

    @Optional()
    @CollectionOf(MiotSpecV2ServiceAction)
    @Description('Service actions')
    public actions?: MiotSpecV2ServiceAction[];

    @Optional()
    @CollectionOf(MiotSpecV2ServiceEvent)
    @Description('Service events')
    public events?: MiotSpecV2ServiceEvent[];
}
