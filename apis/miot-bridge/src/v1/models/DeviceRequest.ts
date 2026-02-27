import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';

@Description('Request model for device registration (persists to cache).')
@AdditionalProperties(false)
export class DeviceRequest {
    @Description('IP address of the Xiaomi device.')
    @Required()
    @Property()
    @Example('192.168.1.100')
    public address: string;

    @Description('Device token (32-char hex string), obtained from Xiaomi Cloud Tokens Extractor.')
    @Required()
    @Property()
    @Example('76506e394d327a617875497243654749')
    public token: string;

    @Description('Device model identifier (e.g. xiaomi.vacuum.c102gl).')
    @Required()
    @Property()
    @Example('xiaomi.vacuum.c102gl')
    public model: string;
}
