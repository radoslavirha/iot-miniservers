import { AdditionalProperties, Description, Enum, Example, Property, Required } from '@tsed/schema';
import { QrType } from './QrType.enum.js';

@AdditionalProperties(false)
export class QrCodeCreateRequest {
    @Required()
    @Property(String)
    @Description('Free-form URL the slug should redirect to at scan time. Any reachable URL is valid.')
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
}
