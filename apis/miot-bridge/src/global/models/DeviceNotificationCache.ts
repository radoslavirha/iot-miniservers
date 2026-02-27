import { AdditionalProperties, Property, Required } from '@tsed/schema';

/**
 * Domain model for a cached device notification subscription.
 */
@AdditionalProperties(false)
export class DeviceNotificationCache {
    /** Unique subscription ID (UUID v4). Assigned by the storage layer on create. */
    @Property(String) public id?: string;
    /** Application-level device ID (UUID v4) the subscription belongs to. */
    @Required() @Property(String) public deviceId: string;
    /** Miot spec property command key subscribed to (e.g. vacuum:mode). */
    @Required() @Property(String) public property: string;
}
