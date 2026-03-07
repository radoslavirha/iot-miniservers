import { Description, Property, Required } from '@tsed/schema';

export class UdpConfig {
    @Required()
    @Property(Boolean)
    @Description('Whether the UDP listener is enabled.')
    public enabled: boolean;

    @Required()
    @Property(Number)
    @Description('UDP port to listen on.')
    public port: number;
}
