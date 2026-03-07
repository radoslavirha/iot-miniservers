import { AdditionalProperties, Description } from '@tsed/schema';
import { DeviceWithSpecResponse } from './DeviceWithSpecResponse.js';

@Description('Device capabilities returned by the discover endpoint (not persisted).')
@AdditionalProperties(false)
export class DeviceDiscoverResponse extends DeviceWithSpecResponse {}
