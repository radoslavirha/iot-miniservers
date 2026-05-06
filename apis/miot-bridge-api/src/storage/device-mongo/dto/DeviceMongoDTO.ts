import { Model } from '@tsed/mongoose';
import { Any, Property, Required } from '@tsed/schema';
import { BaseMongo } from '@radoslavirha/tsed-mongoose';

/**
 * Mongoose document schema for the device cache collection.
 */
@Model({ collection: 'devices', schemaOptions: { timestamps: true, versionKey: false } })
export class DeviceMongoDTO extends BaseMongo {
    /** Xiaomi hardware device ID from handshake. Used as natural upsert key. */
    @Required() @Property(Number) public deviceId: number;
    @Required() @Property(String) public address: string;
    @Required() @Property(String) public token: string;
    @Required() @Property(Number) public stamp: number;
    @Required() @Property(String) public modelName: string;
    @Required() @Property(String) public specURL: string;
    /** Unix timestamp (ms) of last stamp refresh. 0 means unknown. */
    @Property(Number) public stampUpdatedAt?: number;
    /** Raw MIoT spec stored as plain JSON object. */
    @Required() @Any() public rawSpec: unknown;
}
