import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';
import { Coordinates } from './Coordinates.js';

@Description('A base city class for other forecast models.')
@AdditionalProperties(false)
export class City extends Coordinates{
    @Description('The ID of the city.')
    @Required()
    @Property()
    @Example(26)
    public id: number;

    @Description('The name of the city.')
    @Required()
    @Property()
    @Example('Praha')
    public name: string;
}