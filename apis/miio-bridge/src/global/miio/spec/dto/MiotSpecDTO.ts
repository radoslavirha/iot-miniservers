import { AdditionalProperties, CollectionOf, Description, Property } from '@tsed/schema';
import { MiotSpecServiceDTO } from './MiotSpecServiceDTO.js';

@Description('Raw MIoT spec response from miot-spec.org.')
@AdditionalProperties(false)
export class MiotSpecDTO {
    @Property() public type: string;
    @Property() public description: string;
    @CollectionOf(MiotSpecServiceDTO) public services: MiotSpecServiceDTO[];
}
