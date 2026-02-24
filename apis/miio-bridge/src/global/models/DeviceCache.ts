import { AdditionalProperties, Description, Property, Required } from '@tsed/schema';
import { MiotSpecV2 } from './miio-spec-v2/index.js';
import { Device } from './Device.js';

/**
 * Domain model for a cached device.
 * Not a Ts.ED schema model — fields are intentionally undecorated.
 */
@Description('Cached device with raw MIoT spec.')
@AdditionalProperties(false)
export class DeviceCache extends Device {
    /** Raw MIoT spec as a domain model. Parsed on demand via MiotSpecV2Mapper. */
    @Property(MiotSpecV2)
    @Required()
    public rawSpec: MiotSpecV2;
}
