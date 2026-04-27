import { AdditionalProperties, Property, Required } from '@tsed/schema';
import { MiotSpecV2DTO } from '../../../endpoints/miot-spec-v2/dto/MiotSpecV2DTO.js';

/**
 * JSON-on-disk shape for file-backed device cache.
 */
@AdditionalProperties(false)
export class DeviceLocalStorageDTO {
    @Required() @Property(String) public id: string;
    @Required() @Property(Number) public deviceId: number;
    @Required() @Property(String) public address: string;
    @Required() @Property(String) public token: string;
    @Required() @Property(Number) public stamp: number;
    @Required() @Property(String) public model: string;
    @Required() @Property(String) public specURL: string;
    @Required() @Property(MiotSpecV2DTO) public rawSpec: MiotSpecV2DTO;
    @Required() @Property(Number) public stampUpdatedAt: number;
    @Required() @Property(Date) public createdAt: Date;
    @Required() @Property(Date) public updatedAt: Date;
}
