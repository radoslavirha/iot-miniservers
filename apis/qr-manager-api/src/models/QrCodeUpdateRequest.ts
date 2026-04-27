import { AdditionalProperties, Description, Enum, Example, Property } from '@tsed/schema';
import { QrType } from './QrType.enum.js';

@AdditionalProperties(false)
export class QrCodeUpdateRequest {
    @Property(String)
    @Description('New target URL. Omit to keep the current value.')
    @Example('https://new-ui.home/devices/shelf-1')
    public targetURL?: string;

    @Property(String)
    @Description('New label. Omit to keep the current value.')
    @Example('Shelf 1 — Plant Watering (renamed)')
    public label?: string;

    @Enum(QrType)
    @Description('New logical category. Omit to keep the current value.')
    public type?: QrType;

    @Property(Boolean)
    @Description('Toggle active state. When false the redirect returns 404.')
    @Example(false)
    public active?: boolean;
}
