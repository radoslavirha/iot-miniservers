import { AdditionalProperties, Description, Example, ForwardGroups, Groups, Property, Required } from '@tsed/schema';
import { GROUP_NEVER_SIMPLIFIED_SPEC } from '../ModelGroups.js';
import { SimplifiedMiotSpec } from './simplified-miot-spec/SimplifiedMiotSpec.js';

/**
 * Device capabilities returned by the discover endpoint (not persisted).
 * Does not include id or stamp — those are only assigned after registration.
 */
@Description('Device capabilities returned by the discover endpoint (not persisted).')
@AdditionalProperties(false)
export class DeviceDiscoverResponse {
    @Required() @Property(Number)
    @Description('Unique device ID assigned by the device during handshake.')
    public deviceId: number;

    @Required() @Property(String)
    @Description('IP address of the device.')
    public address: string;

    @Required() @Property(String)
    @Description('Device token (32-char hex string).')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public token: string;

    @Required() @Property(String)
    @Description('Device model identifier.')
    @Example('xiaomi.vacuum.c102gl')
    public model: string;

    @Required() @Property(String)
    @Description('Full URL to the MIoT spec on miot-spec.org.')
    public specURL: string;

    @Required() @Property(SimplifiedMiotSpec)
    @Description('Parsed MIoT spec describing the device capabilities.')
    @ForwardGroups()
    public spec: SimplifiedMiotSpec;
}
