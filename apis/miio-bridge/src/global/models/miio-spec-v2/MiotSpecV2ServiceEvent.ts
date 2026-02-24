import { AdditionalProperties, CollectionOf, Description, Property, Required } from '@tsed/schema';

/**
 * Raw MIoT spec service event — plain domain model, 1:1 with MiotSpecV2ServiceEventDTO.
 */
@Description('A single event within a MIoT service.')
@AdditionalProperties(false)
export class MiotSpecV2ServiceEvent {
    @Required()
    @Property(Number)
    @Description('Event instance ID')
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
    @CollectionOf(Number)
    @Description('Argument PIIDs')
    public arguments: number[];
}
