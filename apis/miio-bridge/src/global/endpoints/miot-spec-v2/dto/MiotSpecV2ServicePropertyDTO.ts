import { AdditionalProperties, CollectionOf, Enum, Name, Optional, Property } from '@tsed/schema';
import { MiotSpecV2PropertyAccessDTO } from './MiotSpecV2PropertyAccessDTO.enum.js';
import { MiotSpecV2PropertyFormatDTO } from './MiotSpecV2PropertyFormatDTO.enum.js';
import { MiotSpecV2PropertyValueDTO } from './MiotSpecV2PropertyValueDTO.js';

@AdditionalProperties(false)
export class MiotSpecV2ServicePropertyDTO {
    @Property() public iid: number;
    @Property() public type: string;
    @Property() public description: string;
    @Enum(MiotSpecV2PropertyFormatDTO) public format: MiotSpecV2PropertyFormatDTO;
    @CollectionOf(String) @Enum(MiotSpecV2PropertyAccessDTO) public access: MiotSpecV2PropertyAccessDTO[];
    @Optional() @Property() public unit?: string;
    @Optional() @CollectionOf(MiotSpecV2PropertyValueDTO) @Name('value-list') public valueList?: MiotSpecV2PropertyValueDTO[];
    @Optional() @CollectionOf(Number) @Name('value-range') public valueRange?: number[];
    @Optional() @CollectionOf(String) @Name('gatt-access') public gattAccess?: string[];
}
