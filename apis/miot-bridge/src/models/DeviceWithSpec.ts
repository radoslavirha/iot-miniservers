import { Description, ForwardGroups, Property, Required } from '@tsed/schema';
import { Device } from './Device.js';
import { SimplifiedMiotSpec } from './simplified-miot-spec/SimplifiedMiotSpec.js';

/**
 * Base class for device response models that include a parsed MIoT spec.
 * Shared by DeviceGetResponse and DevicePostResponse (registered devices with full Device fields).
 * DeviceDiscoverResponse is standalone — it does not have id or stamp.
 */
export class DeviceWithSpec extends Device {
    @Description('Parsed MIoT spec describing the device capabilities.')
    @Required()
    @Property(SimplifiedMiotSpec)
    @ForwardGroups()
    public spec: SimplifiedMiotSpec;
}
