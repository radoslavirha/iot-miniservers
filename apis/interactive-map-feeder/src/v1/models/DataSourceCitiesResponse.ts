import { AdditionalProperties, CollectionOf, Description, ForwardGroups } from '@tsed/schema';
import { CityLED } from './CityLED.js';

@Description('A response with cities and corresponding RGB colors.')
@AdditionalProperties(false)
export class DataSourceCitiesResponse {
    @Description('An array of cities with RGB color representing data source data for LEDs.')
    @CollectionOf(CityLED)
    @ForwardGroups()
    public cities: CityLED[];
}