import { AdditionalProperties, CollectionOf, Property } from '@tsed/schema';

@AdditionalProperties(false)
export class MiotSpecV2ServiceEventDTO {
    @Property() public iid: number;
    @Property() public type: string;
    @Property() public description: string;
    @CollectionOf(Number) public arguments: number[];
}
