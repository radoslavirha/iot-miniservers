import { AdditionalProperties, Property, Required } from '@tsed/schema';
import { MiotSpecV2DTO } from '../../../endpoints/miot-spec-v2/dto/MiotSpecV2DTO.js';

/**
 * JSON-on-disk shape for file-backed device cache.
 */
@AdditionalProperties(false)
export class DeviceLocalStorageDTO {
    /** Application-level UUID. */
    @Required() @Property(String) public id: string;
    @Required() @Property(Number) public deviceId: number;
    @Required() @Property(String) public address: string;
    @Required() @Property(String) public token: string;
    @Required() @Property(Number) public stamp: number;
    @Required() @Property(String) public model: string;
    @Required() @Property(String) public specURL: string;
    @Required() @Property(MiotSpecV2DTO) public rawSpec: MiotSpecV2DTO;
    /** Unix timestamp (ms) of when the stamp was last refreshed. Optional for backwards-compatibility; 0 means unknown. */
    @Property(Number) public stampUpdatedAt?: number;
}
