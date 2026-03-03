import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { Description, Optional, Property } from '@tsed/schema';
import { MongoConfig } from './MongoConfig.js';
import { NotificationsConfig } from './NotificationsConfig.js';
import { PollingConfig } from './PollingConfig.js';
import { UdpConfig } from './UdpConfig.js';

export class ConfigModel extends BaseConfig {
    @Property(String)
    @Optional()
    @Description('Path to the JSON device cache file. Relative to CWD.')
    public cachePath?: string;

    @Property(MongoConfig)
    @Optional()
    @Description('MongoDB configuration. When mongodb.enabled is true, MongoDB is used as the device storage.')
    public mongodb?: MongoConfig;

    @Property(UdpConfig)
    @Optional()
    @Description('UDP listener configuration. When udp.enabled is true, the server accepts commands over UDP.')
    public udp?: UdpConfig;

    @Property(PollingConfig)
    @Optional()
    @Description('Device property polling configuration. When polling.enabled is true, subscribed properties are polled at the configured interval.')
    public polling?: PollingConfig;

    @Property(NotificationsConfig)
    @Optional()
    @Description('Outbound notification transport configuration.')
    public notifications?: NotificationsConfig;
}
