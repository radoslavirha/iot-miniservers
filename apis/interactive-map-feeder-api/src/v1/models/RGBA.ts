import { AdditionalProperties, Description, Example, Groups, Max, Min, Property, Required } from '@tsed/schema';
import { GROUP_NEVER_IOT } from '../ModelGroups.js';

@Description('A simple model representing RGB(A) color.')
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
    @Min(0)
    @Max(255)
    @Groups(GROUP_NEVER_IOT)
    public a: number;

    constructor (r: number, g: number, b: number, a: number) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}