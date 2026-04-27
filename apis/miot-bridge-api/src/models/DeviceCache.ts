import { AdditionalProperties, Property, Required } from '@tsed/schema';
import { MiotSpecV2 } from './miot-spec-v2/index.js';
import { Device } from './Device.js';

/**
 * Domain model for a cached device.
 */
@AdditionalProperties(false)
export class DeviceCache extends Device {
    /** Raw MIoT spec as a domain model. Parsed on demand via MiotSpecV2Mapper. */
    @Required()
    @Property(MiotSpecV2)
    public rawSpec: MiotSpecV2;
}
