import { Injectable, ProviderScope, Scope } from '@tsed/di';
import { RadarService } from '../services/index.js';
import { CityLED, DataSourceCitiesResponse } from '../models/index.js';
import { CommonUtils } from '@radoslavirha/utils';
import { DataSources } from '../DataSources.js';
import { InternalServerError } from '@tsed/exceptions';

@Injectable()
@Scope(ProviderScope.REQUEST)
export class DataSourcesCityHandler {
    constructor(
        private radarService: RadarService
    ) {}

    public async execute(dataSource: DataSources, radius?: number): Promise<DataSourceCitiesResponse> {
        let cities: CityLED[];

        switch (dataSource) {
            case DataSources.Radar:
                cities = await this.radarService.getCitiesFromRadar(radius);
                break;
            default:
                throw new InternalServerError(`Unhandled data source: ${dataSource}`);
        }
        return CommonUtils.buildModel(DataSourceCitiesResponse, {
            cities: cities
        });
    }
}