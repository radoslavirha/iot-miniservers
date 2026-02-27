import { AdditionalProperties, CollectionOf, Description, Required } from '@tsed/schema';
import { DeviceGetResponse } from './DeviceGetResponse.js';

@Description('Response model for listing all registered devices.')
@AdditionalProperties(false)
export class DevicesGetResponse {
    @Required()
    @CollectionOf(DeviceGetResponse)
    @Description('List of registered devices.')
    public devices: DeviceGetResponse[];
}
