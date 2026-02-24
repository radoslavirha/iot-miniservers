import { AdditionalProperties, Description, ForwardGroups, Property, Required } from '@tsed/schema';
import { SimplifiedMiotSpec } from './simplified-miot-spec/SimplifiedMiotSpec.js';
import { Device } from '../../global/models/Device.js';

@Description('Device information returned by discovery or registration endpoints.')
@AdditionalProperties(false)
export class DeviceResponseModel extends Device {
    @Description('Parsed MIoT spec describing the device capabilities.')
    @Required()
    @Property(SimplifiedMiotSpec)
    @ForwardGroups()
    public spec: SimplifiedMiotSpec;
}
