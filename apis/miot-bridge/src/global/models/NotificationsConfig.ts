import { AdditionalProperties, Description, Optional, Property, Required } from '@tsed/schema';

@AdditionalProperties(false)
export class UdpNotificationConfig {
    @Required()
    @Property(Boolean)
    @Description('Whether UDP outbound notifications are enabled.')
    public enabled: boolean;

    @Property(String)
    @Optional()
    @Description('Target address in host:port format, e.g. "192.168.1.100:5000".')
    public address?: string;
}

@AdditionalProperties(false)
export class HttpNotificationConfig {
    @Required()
    @Property(Boolean)
    @Description('Whether HTTP outbound notifications are enabled.')
    public enabled: boolean;

    @Property(String)
    @Optional()
    @Description('Target URL to POST notification payloads to, e.g. "http://192.168.1.100:5001/notify".')
    public address?: string;
}

@AdditionalProperties(false)
export class MqttNotificationConfig {
    @Required()
    @Property(Boolean)
    @Description('Whether MQTT outbound notifications are enabled. Full MQTT support is implemented in Phase 8.')
    public enabled: boolean;
}

/**
 * Outbound notification transport configuration.
 * Attached under `notifications` in the server config.
 */
@AdditionalProperties(false)
export class NotificationsConfig {
    @Property(UdpNotificationConfig)
    @Optional()
    @Description('UDP notification settings.')
    public udp?: UdpNotificationConfig;

    @Property(HttpNotificationConfig)
    @Optional()
    @Description('HTTP notification settings.')
    public http?: HttpNotificationConfig;

    @Property(MqttNotificationConfig)
    @Optional()
    @Description('MQTT notification settings.')
    public mqtt?: MqttNotificationConfig;
}
