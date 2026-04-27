import { AdditionalProperties, CollectionOf, Property, Required } from '@tsed/schema';
import { QrCodeResponse } from './QrCodeResponse.js';

@AdditionalProperties(false)
export class QrCodeListResponse {
    @Required()
    @CollectionOf(QrCodeResponse)
    @Property(Array)
    public items: QrCodeResponse[];
}
