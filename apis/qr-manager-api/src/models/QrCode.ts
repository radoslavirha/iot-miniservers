import { AdditionalProperties, Description, Enum, Example, Property, Required } from '@tsed/schema';
import { BaseModel } from '@radoslavirha/tsed-common';
import { QrType } from './QrType.enum.js';

/**
 * Domain model for a stored QR code mapping.
 */
@AdditionalProperties(false)
export class QrCode extends BaseModel {
    @Required()
    @Property(String)
    @Description('Short slug encoded in the QR code. 4 characters of [a-z0-9].')
    @Example('x7k2')
    public slug: string;

    @Required()
    @Property(String)
    @Description('Free-form URL the slug currently redirects to. Resolved at scan time — can point to any reachable URL (internal app, public site, Google Maps link, etc.). Mutable without reprinting the QR.')
    @Example('https://iot-ui.home/devices/shelf-1')
    public targetURL: string;

    @Required()
    @Property(String)
    @Description('Human readable label shown in the admin UI.')
    @Example('Shelf 1 — Plant Watering')
    public label: string;

    @Required()
    @Enum(QrType)
    @Description('Logical category of the QR code.')
    @Example(QrType.IOT_DEVICE)
    public type: QrType;

    @Required()
    @Property(Boolean)
    @Description('When false the redirect endpoint returns 404 for this slug.')
    @Example(true)
    public active: boolean;
}
