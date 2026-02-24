import { AdditionalProperties, CollectionOf, Optional, Property } from '@tsed/schema';
import { MiotSpecServiceActionDTO } from './MiotSpecServiceActionDTO.js';
import { MiotSpecServiceEventDTO } from './MiotSpecServiceEventDTO.js';
import { MiotSpecServicePropertyDTO } from './MiotSpecServicePropertyDTO.js';

@AdditionalProperties(false)
export class MiotSpecServiceDTO {
    @Property() public iid: number;
    @Property() public type: string;
    @Property() public description: string;
    @Optional() @CollectionOf(MiotSpecServicePropertyDTO) public properties?: MiotSpecServicePropertyDTO[];
    @Optional() @CollectionOf(MiotSpecServiceActionDTO) public actions?: MiotSpecServiceActionDTO[];
    @Optional() @CollectionOf(MiotSpecServiceEventDTO) public events?: MiotSpecServiceEventDTO[];
}
