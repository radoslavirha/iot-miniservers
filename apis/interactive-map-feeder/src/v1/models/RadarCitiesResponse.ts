import { AdditionalProperties, CollectionOf, Description } from '@tsed/schema';
import { CityLED } from './CityLED.js';

@Description('A response with cities and corresponding RGBA colors.')
@AdditionalProperties(false)
export class RadarCitiesResponse {
    @Description('An array of cities with RGBA color representing current situation from radar for LEDs.')
    @CollectionOf(CityLED)
    public cities: CityLED[];
}