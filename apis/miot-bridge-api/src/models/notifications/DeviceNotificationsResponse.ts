import { AdditionalProperties, CollectionOf, Description, Required } from '@tsed/schema';
import { DeviceNotification } from './DeviceNotification.js';

@Description('Response model for a list of device notification subscriptions.')
@AdditionalProperties(false)
export class DeviceNotificationsResponse {
    @Required()
    @CollectionOf(DeviceNotification)
    @Description('List of notification subscriptions for the device.')
    public notifications: DeviceNotification[];
}
