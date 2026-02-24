import { AdditionalProperties, Property } from '@tsed/schema';

@AdditionalProperties(false)
export class MiotSpecV2InstanceDTO {
    @Property() public model: string;
    @Property() public version: number;
    @Property() public type: string;
    @Property() public ts: number;
}
