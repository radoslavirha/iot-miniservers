import { AdditionalProperties, Description, Example, Max, Min, Property, Required } from '@tsed/schema';

@Description('A simple model representing RGB color.')
@AdditionalProperties(false)
export class RGB {
    @Description('The red color.')
    @Required()
    @Property()
    @Example(255)
    @Min(0)
    @Max(255)
    public r: number;

    @Description('The green color.')
    @Required()
    @Property()
    @Example(0)
    @Min(0)
    @Max(255)
    public g: number;

    @Description('The blue color.')
    @Required()
    @Property()
    @Example(0)
    @Min(0)
    @Max(255)
    public b: number;

    constructor (r: number, g: number, b: number) {
        this.r = r;
        this.g = g;
        this.b = b;
    }
}