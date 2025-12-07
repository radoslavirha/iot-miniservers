import { AdditionalProperties, Description, Example, Groups, Property, Required } from '@tsed/schema';
import { GROUP_NEVER_IOT } from '../ModelGroups.js';
import { Coordinates } from './Coordinates.js';

@Description('A base city class for other forecast models.')
@AdditionalProperties(false)
export class City extends Coordinates{
    @Description('The ID of the city epresenting an index of the LED light.')
    @Required()
    @Property()
    @Example(26)
    public id: number;

    @Description('The name of the city.')
    @Required()
    @Property()
    @Example('Praha')
    @Groups(GROUP_NEVER_IOT)
    public name: string;
}