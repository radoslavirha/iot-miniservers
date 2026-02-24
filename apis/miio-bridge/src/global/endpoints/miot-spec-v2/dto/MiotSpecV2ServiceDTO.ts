import { AdditionalProperties, CollectionOf, Optional, Property } from '@tsed/schema';
import { MiotSpecV2ServiceActionDTO } from './MiotSpecV2ServiceActionDTO.js';
import { MiotSpecV2ServiceEventDTO } from './MiotSpecV2ServiceEventDTO.js';
import { MiotSpecV2ServicePropertyDTO } from './MiotSpecV2ServicePropertyDTO.js';

@AdditionalProperties(false)
export class MiotSpecV2ServiceDTO {
    @Property() public iid: number;
    @Property() public type: string;
    @Property() public description: string;
    @Optional() @CollectionOf(MiotSpecV2ServicePropertyDTO) public properties?: MiotSpecV2ServicePropertyDTO[];
    @Optional() @CollectionOf(MiotSpecV2ServiceActionDTO) public actions?: MiotSpecV2ServiceActionDTO[];
    @Optional() @CollectionOf(MiotSpecV2ServiceEventDTO) public events?: MiotSpecV2ServiceEventDTO[];
}
