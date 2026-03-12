import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';
import { BaseModel } from '@radoslavirha/tsed-common';

/**
 * Domain model representing a single persisted notification subscription.
 */
@AdditionalProperties(false)
export class DeviceNotification extends BaseModel {

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
