import { AdditionalProperties, CollectionOf, Enum, Name, Optional, Property } from '@tsed/schema';
import { PropertyAccessDTO } from './PropertyAccessDTO.enum.js';
import { PropertyFormatDTO } from './PropertyFormatDTO.enum.js';
import { MiotSpecPropertyValueDTO } from './MiotSpecPropertyValueDTO.js';

@AdditionalProperties(false)
export class MiotSpecServicePropertyDTO {
    @Property() public iid: number;
    @Property() public type: string;
    @Property() public description: string;
    @Enum(PropertyFormatDTO) public format: PropertyFormatDTO;
    @CollectionOf(String) @Enum(PropertyAccessDTO) public access: PropertyAccessDTO[];
    @Optional() @Property() public unit?: string;
    @Optional() @CollectionOf(MiotSpecPropertyValueDTO) @Name('value-list') public valueList?: MiotSpecPropertyValueDTO[];
    @Optional() @CollectionOf(Number) @Name('value-range') public valueRange?: number[];
    @Optional() @CollectionOf(String) @Name('gatt-access') public gattAccess?: string[];
}
