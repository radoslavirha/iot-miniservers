import { AdditionalProperties, CollectionOf, Description, Property, Required } from '@tsed/schema';
import { MiotSpecService } from './MiotSpecService.js';

/**
 * Raw MIoT spec — plain domain model, 1:1 with MiotSpecDTO.
 * Used as the stored raw spec in DeviceCache; parsed on demand via MiotSpecV2Mapper.
 */
@Description('Raw MIoT device specification, 1:1 with the miot-spec.org API response.')
@AdditionalProperties(false)
export class MiotSpec {
    @Required()
    @Property(String)
    @Description('Full MIoT spec type URN')
    public type: string;

    @Required()
    @Property(String)
    @Description('Human-readable device description')
    public description: string;

    @Required()
    @CollectionOf(MiotSpecService)
    @Description('All services in the spec')
    public services: MiotSpecService[];
}
