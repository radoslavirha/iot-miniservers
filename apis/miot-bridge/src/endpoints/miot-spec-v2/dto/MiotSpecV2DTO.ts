import { AdditionalProperties, CollectionOf, Description, Property } from '@tsed/schema';
import { MiotSpecV2ServiceDTO } from './MiotSpecV2ServiceDTO.js';

@Description('Raw MIoT spec response from miot-spec.org.')
@AdditionalProperties(false)
export class MiotSpecV2DTO {
    @Property() public type: string;
    @Property() public description: string;
    @CollectionOf(MiotSpecV2ServiceDTO) public services: MiotSpecV2ServiceDTO[];
}
