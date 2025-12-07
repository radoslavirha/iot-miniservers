import { AdditionalProperties, CollectionOf, Description, Enum, Example, Required } from '@tsed/schema';
import { DataSources } from '../DataSources.js';

@Description('A response with available data sources.')
@AdditionalProperties(false)
export class DataSourcesResponse {
    @Description('An array of available data sources.')
    @Required()
    @CollectionOf(DataSources)
    @Enum(DataSources)
    @Example([DataSources.Radar])
    public dataSources: DataSources[];
}