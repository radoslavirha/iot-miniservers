import { AdditionalProperties, Description } from '@tsed/schema';
import { DeviceWithSpec } from './DeviceWithSpec.js';

@Description('Response model returned after successful device registration.')
@AdditionalProperties(false)
export class DevicePostResponse extends DeviceWithSpec {}
