import { Model } from '@tsed/mongoose';
import { Property, Required } from '@tsed/schema';
import { BaseMongo } from '@radoslavirha/tsed-mongoose';

/**
 * Mongoose document schema for the notification subscription collection.
 */
@Model({ collection: 'notifications', schemaOptions: { timestamps: true, versionKey: false } })
export class DeviceNotificationMongoDTO extends BaseMongo {
    /** Application-level device ID (UUID v4 from MongoDB _id) the subscription belongs to. */
    @Required() @Property(String) public deviceId: string;
    /** MIoT spec property command key subscribed to (e.g. vacuum:mode). */
    @Required() @Property(String) public property: string;
}
