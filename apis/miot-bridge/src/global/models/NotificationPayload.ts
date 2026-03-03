import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';

/**
 * Payload sent to all configured outbound notification transports
 * (HTTP POST body / UDP JSON datagram) when a property value is observed.
 */
@AdditionalProperties(false)
export class NotificationPayload {
    @Required()
    @Property(String)
    @Description('Application-level device ID (UUID v4).')
    @Example('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    public deviceId: string;

    @Required()
    @Property(String)
    @Description('Miot spec composite property key, e.g. "vacuum:mode".')
    @Example('vacuum:mode')
    public property: string;

    @Property()
    @Description('Current property value returned by the device.')
    public value: unknown;
}
