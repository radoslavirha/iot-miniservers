import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';

/**
 * Domain model representing a single persisted notification subscription.
 */
@AdditionalProperties(false)
export class DeviceNotification {
    @Required()
    @Property(String)
    @Description('Unique notification subscription ID (UUID v4).')
    @Example('b2c3d4e5-f6a7-8901-bcde-f12345678901')
    public id: string;

    @Required()
    @Property(String)
    @Description('Application-level device ID (UUID v4) the subscription belongs to.')
    @Example('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    public deviceId: string;

    @Required()
    @Property(String)
    @Description('Miot spec property command key subscribed to (e.g. vacuum:mode).')
    @Example('vacuum:mode')
    public property: string;
}
