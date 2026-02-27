import { AdditionalProperties, CollectionOf, Description, Example, Required } from '@tsed/schema';

@Description('Request model for creating a device property notification subscription.')
@AdditionalProperties(false)
export class NotificationRequest {
    @Required()
    @CollectionOf(String)
    @Description('List of Miot spec property command keys to subscribe to (e.g. vacuum:mode). Must have READ or WRITE access.')
    @Example(['vacuum:mode', 'vacuum:status'])
    public properties: string[];
}
