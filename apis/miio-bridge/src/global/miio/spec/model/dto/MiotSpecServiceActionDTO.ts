import { AdditionalProperties, CollectionOf, Property } from '@tsed/schema';

@AdditionalProperties(false)
export class MiotSpecServiceActionDTO {
    @Property() public iid: number;
    @Property() public type: string;
    @Property() public description: string;
    @CollectionOf(Number) public in: number[];
    @CollectionOf(Number) public out: number[];
}
