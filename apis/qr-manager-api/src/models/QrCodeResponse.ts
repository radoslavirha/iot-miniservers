import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';
import { QrCode } from './QrCode.js';

@AdditionalProperties(false)
export class QrCodeResponse extends QrCode {
    @Required()
    @Property(String)
    @Description('Public URL encoded in the printed QR. Composed from redirect.baseURL + slug. Scan this URL to trigger the redirect.')
    @Example('https://qr.home/x7k2')
    public qrURL: string;
}
