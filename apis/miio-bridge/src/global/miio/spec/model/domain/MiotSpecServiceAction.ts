import { AdditionalProperties, CollectionOf, Description, Property, Required } from '@tsed/schema';

/**
 * Raw MIoT spec service action — plain domain model, 1:1 with MiotSpecServiceActionDTO.
 */
@Description('A single action within a MIoT service.')
@AdditionalProperties(false)
export class MiotSpecServiceAction {
    @Required()
    @Property(Number)
    @Description('Action instance ID')
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
    @Description('Input parameter PIIDs')
    public in: number[];

    @Required()
    @CollectionOf(Number)
    @Description('Output parameter PIIDs')
    public out: number[];
}
