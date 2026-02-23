import { AdditionalProperties, Description, Example, ForwardGroups, Property, Required } from '@tsed/schema';
import { DeviceSpec } from '../../global/miio/spec/index.js';

@Description('Device information returned by discovery or registration endpoints.')
@AdditionalProperties(false)
export class DeviceResponseModel {
    @Description('Unique device ID assigned by the device during handshake.')
    @Required()
    @Property()
    @Example(1141132187)
    public deviceId: number;

    @Description('IP address of the device.')
    @Required()
    @Property()
    @Example('192.168.1.100')
    public address: string;

    @Description('Device model identifier.')
    @Required()
    @Property()
    @Example('xiaomi.vacuum.c102gl')
    public model: string;

    @Required()
    @Property(String)
    @Description('Full URL to the spec on miot-spec.org')
    public specURL: string;

    @Description('Parsed MIoT spec describing the device capabilities.')
    @Required()
    @Property(DeviceSpec)
    @ForwardGroups()
    public spec: DeviceSpec;
}
