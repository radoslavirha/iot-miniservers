import { AdditionalProperties, Description } from '@tsed/schema';
import { DeviceWithSpecResponse } from './DeviceWithSpecResponse.js';

@Description('Response model returned after successful device registration.')
@AdditionalProperties(false)
export class DevicePostResponse extends DeviceWithSpecResponse {}
