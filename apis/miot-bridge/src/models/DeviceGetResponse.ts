import { AdditionalProperties, Description } from '@tsed/schema';
import { DeviceWithSpec } from './DeviceWithSpec.js';

@Description('Device information returned by GET endpoint.')
@AdditionalProperties(false)
export class DeviceGetResponse extends DeviceWithSpec {}
