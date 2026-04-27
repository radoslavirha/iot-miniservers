import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';
import { QrCode } from './QrCode.js';

@AdditionalProperties(false)
export class QrCodeResponse extends QrCode {
    @Required()
    @Property(String)
    @Description('Public URL encoded in the printed QR. Composed from the configured public base URL and the slug.')
    @Example('https://qr.home/x7k2')
    public qrURL: string;

    @Required()
    @Property(String)
    @Description('URL that returns the QR image (PNG by default; SVG via ?format=svg).')
    @Example('https://api.server.home/qr/qr-codes/<id>/image')
    public imageURL: string;
}
