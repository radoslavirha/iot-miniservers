import { AdditionalProperties, Property, Required } from '@tsed/schema';
import { MiotSpecV2 } from '../../../models/miot-spec-v2/index.js';

/**
 * JSON-on-disk shape for file-backed device cache.
 */
@AdditionalProperties(false)
export class DeviceLocalStorageDTO {
    @Required() @Property(Number) public deviceId: number;
    @Required() @Property(String) public address: string;
    @Required() @Property(String) public token: string;
    @Required() @Property(Number) public stamp: number;
    @Required() @Property(String) public model: string;
    @Required() @Property(String) public specURL: string;
    @Required() @Property(MiotSpecV2) public rawSpec: MiotSpecV2;
}
