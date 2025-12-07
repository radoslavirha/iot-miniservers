import { AdditionalProperties, Description, Example, Groups, Property, Required } from '@tsed/schema';
import { GROUP_NEVER_IOT } from '../ModelGroups.js';

@Description('A simple model representing latitude/longitude coordinates.')
@AdditionalProperties(false)
export class Coordinates {
    @Description('Latitude coordinates.')
    @Required()
    @Property()
    @Example(50.075638)
    @Groups(GROUP_NEVER_IOT)
    public latitude: number;

    @Description('Longitude coordinates.')
    @Required()
    @Property()
    @Example(14.4379)
    @Groups(GROUP_NEVER_IOT)
    public longitude: number;
}