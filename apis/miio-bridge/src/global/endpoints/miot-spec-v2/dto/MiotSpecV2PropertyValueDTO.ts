import { AdditionalProperties, Property } from '@tsed/schema';

@AdditionalProperties(false)
export class MiotSpecV2PropertyValueDTO {
    @Property() public value: number;
    @Property() public description: string;
}
