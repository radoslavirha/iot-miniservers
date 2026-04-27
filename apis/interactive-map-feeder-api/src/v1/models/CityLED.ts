import { Description, Example, ForwardGroups, Property, Required } from '@tsed/schema';
import { City } from './City.js';
import { RGB } from './RGB.js';

export class CityLED extends City {
    @Description('The RGB color for LED.')
    @Required()
    @Property(RGB)
    @Example(new RGB(255, 0, 0))
    @ForwardGroups()
    public color: RGB;
}