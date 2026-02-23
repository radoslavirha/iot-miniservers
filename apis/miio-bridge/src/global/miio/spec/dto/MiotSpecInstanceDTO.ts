import { AdditionalProperties, Property } from '@tsed/schema';

@AdditionalProperties(false)
export class MiotSpecInstanceDTO {
    @Property() public model: string;
    @Property() public version: number;
    @Property() public type: string;
    @Property() public ts: number;
}
