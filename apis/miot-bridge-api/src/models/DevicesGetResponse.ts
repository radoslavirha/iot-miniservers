import { AdditionalProperties, CollectionOf, Description, Required } from '@tsed/schema';
import { DeviceWithSpec } from './DeviceWithSpec.js';

@Description('Response model for listing all registered devices.')
@AdditionalProperties(false)
export class DevicesGetResponse {
    @Required()
    @CollectionOf(DeviceWithSpec)
    @Description('List of registered devices.')
    public devices: DeviceWithSpec[];
}
