import { Description, Example, Property, Required } from '@tsed/schema';
import { RGBA } from './RGBA.js';
import { City } from './City.js';

export class CityLED extends City {
    @Description('The RGBA color for LED.')
    @Required()
    @Property()
    @Example(new RGBA(255, 0, 0, 255))
    public color: RGBA;
}