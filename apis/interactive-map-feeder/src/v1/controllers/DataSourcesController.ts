import { Controller, ProviderScope, Scope } from '@tsed/di';
import { PathParams, QueryParams } from '@tsed/platform-params';
import { Default, Description, Enum, Example, Get, Required, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { DataSourcesCityHandler, DataSourcesImageHandler, DataSourcesListHandler } from '../handlers/index.js';
import { DataSourceCitiesResponse } from '../models/index.js';
import { GROUP_IOT } from '../ModelGroups.js';
import { DataSources } from '../DataSources.js';
import { DataSourcesResponse } from '../models/DataSourcesResponse.js';

@Description('API endpoints representing variety of data sources.')
@Controller('/data-sources')
@Scope(ProviderScope.REQUEST)
@Docs('v1')
export class DataSourcesController {
    constructor(
        private dataSourcesListHandler: DataSourcesListHandler,
        private dataSourceCityHandler: DataSourcesCityHandler,
        private dataSourceImageHandler: DataSourcesImageHandler
    ) {}

    @Get('/list')
    @Description('Returns list of available data sources.')
    @Returns(200, DataSourcesResponse)
    async getDataSources(
    ): Promise<DataSourcesResponse> {
        return this.dataSourcesListHandler.execute();
    }

    @Get('/:dataSource/cities')
    @Description('Returns cities with RGB color representing data from data source.')
    @Returns(200, DataSourceCitiesResponse)
    async getDataSource(
        @Description('Data source which should be used.')
        @Required()
        @PathParams('dataSource')
        @Enum(DataSources)
        @Example(DataSources.Radar)
        dataSource: DataSources,

        @Description('Radius in kilometers around each city to calculate current conditions.')
        @QueryParams('radius')
        @Default(2.5)
        radius?: number
    ): Promise<DataSourceCitiesResponse> {
        return this.dataSourceCityHandler.execute(dataSource, radius);
    }

    @Get('/:dataSource/cities/iot')
    @Description('Returns cities with RGB color representing data from data source. with reduced response.')
    @(Returns(200, DataSourceCitiesResponse).Groups(GROUP_IOT))
    async getDataSourceForIoT(
        @Description('Data source which should be used.')
        @Required()
        @PathParams('dataSource') 
        @Enum(DataSources)
        @Example(DataSources.Radar)
        dataSource: DataSources,

        @Description('Radius in kilometers around each city to calculate current conditions.')
        @QueryParams('radius')
        @Default(2.5)
        radius?: number
    ): Promise<DataSourceCitiesResponse> {
        return this.dataSourceCityHandler.execute(dataSource, radius);
    }

    @Get('/:dataSource/image')
    @Description('Returns current image with cities.')
    @(Returns(200, String).ContentType('image/png'))
    async getDataSourceImage(
        @Description('Data source which should be used.')
        @Required()
        @PathParams('dataSource') 
        @Enum(DataSources)
        @Example(DataSources.Radar)
        dataSource: DataSources
    ): Promise<Buffer> {
        return this.dataSourceImageHandler.execute(dataSource);
    }
}
