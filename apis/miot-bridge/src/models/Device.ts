import { Description, Example, Groups, Property, Required } from '@tsed/schema';
import { GROUP_NEVER_SIMPLIFIED_SPEC } from '../ModelGroups.js';

/**
 * Base device model shared by response and cache models.
 */
export class Device {
    @Required()
    @Property(String)
    @Description('Application-level unique ID (UUID v4) assigned on registration.')
    @Example('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    public id: string;

    @Required()
    @Property(Number)
    @Description('Unique device ID assigned by the device during handshake.')
    @Example(1141132187)
    public deviceId: number;

    @Required()
    @Property(String)
    @Description('IP address of the device.')
    @Example('192.168.1.100')
    public address: string;

    @Required()
    @Property(String)
    @Description('Device token (32-char hex string).')
    @Example('76506e394d327a617875497243654749')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public token: string;

    @Required()
    @Property(Number)
    @Description('Device stamp value from handshake.')
    @Example(123456)
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public stamp: number;

    @Required()
    @Property(String)
    @Description('Device model identifier.')
    @Example('xiaomi.vacuum.c102gl')
    public model: string;

    @Required()
    @Property(String)
    @Description('Full URL to the MIoT spec on miot-spec.org.')
    @Example('https://miot-spec.org/miot-spec-v2/instance?type=urn:miot-spec-v2:device:vacuum:0000A006:xiaomi-c102gl:2')
    public specURL: string;

    @Property(Number)
    @Description('Unix timestamp (ms) of when the stamp was last refreshed. 0 means unknown (treat as stale).')
    @Example(1700000000000)
    public stampUpdatedAt: number = 0;
}
