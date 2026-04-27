import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';

@Description('Request model for device discovery (no persistence).')
@AdditionalProperties(false)
export class DeviceDiscoverRequest {
    @Description('IP address of the Xiaomi device.')
    @Required()
    @Property()
    public address: string;

    @Description('Device token (32-char hex string), obtained from Xiaomi Cloud Tokens Extractor.')
    @Required()
    @Property()
    public token: string;

    @Description('Device model identifier (e.g. xiaomi.vacuum.c102gl).')
    @Required()
    @Property()
    @Example('xiaomi.vacuum.c102gl')
    public model: string;
}
