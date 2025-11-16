import { AdditionalProperties, Description, Example, Max, Min, Property, Required } from '@tsed/schema';

@Description('A simple model representing RGBA color.')
@AdditionalProperties(false)
export class RGBA {
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

    @Description('The alpha channel.')
    @Required()
    @Property()
    @Example(255)
    @Min(0)
    @Max(255)
    public a: number;

    constructor (r: number, g: number, b: number, a: number) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}