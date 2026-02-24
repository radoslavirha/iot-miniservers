import { AdditionalProperties, Property } from '@tsed/schema';

@AdditionalProperties(false)
export class MiotSpecPropertyValueDTO {
    @Property() public value: number;
    @Property() public description: string;
}
