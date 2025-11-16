import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';

@Description('A simple model representing latitude/longitude coordinates.')
@AdditionalProperties(false)
export class Coordinates {
    @Description('Latitude coordinates.')
    @Required()
    @Property()
    @Example(50.075638)
    public latitude: number;

    @Description('Longitude coordinates.')
    @Required()
    @Property()
    @Example(14.4379)
    public longitude: number;
}