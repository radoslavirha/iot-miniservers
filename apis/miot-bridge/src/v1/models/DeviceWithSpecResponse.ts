import { Description, ForwardGroups, Property, Required } from '@tsed/schema';
import { Device } from '../../global/models/Device.js';
import { SimplifiedMiotSpec } from '../../global/models/simplified-miot-spec/SimplifiedMiotSpec.js';

/**
 * Abstract base for device response models that include a parsed MIoT spec.
 * Shared by DeviceGetResponse, DevicePostResponse, and DeviceDiscoverResponse.
 */
export abstract class DeviceWithSpecResponse extends Device {
    @Description('Parsed MIoT spec describing the device capabilities.')
    @Required()
    @Property(SimplifiedMiotSpec)
    @ForwardGroups()
    public spec: SimplifiedMiotSpec;
}
