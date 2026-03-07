import { AdditionalProperties, Description } from '@tsed/schema';
import { DeviceWithSpecResponse } from './DeviceWithSpecResponse.js';

@Description('Device information returned by GET endpoint.')
@AdditionalProperties(false)
export class DeviceGetResponse extends DeviceWithSpecResponse {}
