import { Model, Indexed, Unique } from '@tsed/mongoose';
import { Enum, Property, Required } from '@tsed/schema';
import { BaseMongo } from '@radoslavirha/tsed-mongoose';
import { QrType } from '../../../models/QrType.enum.js';

/**
 * Mongoose document schema for QR code mappings.
 */
@Model({ collection: 'qr_codes', schemaOptions: { timestamps: true, versionKey: false } })
export class QrCodeMongoDTO extends BaseMongo {
    /** Short slug embedded in the printed QR code. Generated server-side via nanoid. */
    @Required() @Unique() @Property(String) public slug: string;

    /** Current redirect target. Mutable. */
    @Required() @Property(String) public targetURL: string;

    /** Human readable label for admin UI. */
    @Required() @Property(String) public label: string;

    /** Logical category for filtering. */
    @Required() @Indexed() @Enum(QrType) public type: QrType;

    /** When false the redirect endpoint serves 404. */
    @Required() @Indexed() @Property(Boolean) public active: boolean;
}
