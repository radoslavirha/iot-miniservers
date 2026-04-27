import { Description, Example, Groups, Property, Required } from '@tsed/schema';
import { BaseModel } from '@radoslavirha/tsed-common';
import { GROUP_NEVER_SIMPLIFIED_SPEC } from '../ModelGroups.js';

/**
 * Base device model shared by response and cache models.
 */
export class Device extends BaseModel {

    @Required()
    @Property(Number)
    @Description('Unique device ID assigned by the device during handshake.')
    public deviceId: number;

    @Required()
    @Property(String)
    @Description('IP address of the device.')
    public address: string;

    @Required()
    @Property(String)
    @Description('Device token (32-char hex string).')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public token: string;

    @Required()
    @Property(Number)
    @Description('Device stamp value from handshake.')
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
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public stampUpdatedAt: number = 0;
}
