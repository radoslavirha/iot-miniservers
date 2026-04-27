import { AdditionalProperties, Property, Required } from '@tsed/schema';

/**
 * JSON-on-disk shape for file-backed notification subscription cache.
 */
@AdditionalProperties(false)
export class NotificationLocalStorageDTO {
    /** Assigned by the repository on create. */
    @Required() @Property(String) public id: string;
    @Required() @Property(String) public deviceId: string;
    @Required() @Property(String) public property: string;
    @Required() @Property(Date) public createdAt: Date;
    @Required() @Property(Date) public updatedAt: Date;
}
