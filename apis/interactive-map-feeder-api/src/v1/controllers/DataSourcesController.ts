import { Controller, ProviderScope, Scope } from '@tsed/di';
import { PathParams, QueryParams } from '@tsed/platform-params';
import { Default, Description, Enum, Example, Get, Required, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { DataSourcesCityHandler, DataSourcesImageHandler, DataSourcesListHandler } from '../handlers/index.js';
import { DataSourceCitiesResponse } from '../models/index.js';
import { GROUP_IOT } from '../ModelGroups.js';
import { DataSources } from '../DataSources.js';
import { DataSourcesResponse } from '../models/DataSourcesResponse.js';
import { Authenticate } from '@radoslavirha/tsed-auth';
import { AuthMethod } from '../../global/models/AuthMethod.enum.js';

@Description('API endpoints representing variety of data sources.')
@Controller('/data-sources')
@Scope(ProviderScope.REQUEST)
@Docs('v1')
// Guarded at the class, so a route added here is protected the moment it is
// written. The one device route below overrides the method it asks for; it does
// not opt out of the guard.
@Authenticate(AuthMethod.Idp)
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
    /**
     * The only route the LaskaKit map calls, and the only one that admits a
     * device.
     *
     * A method-level `@Authenticate` **replaces** the class-level one rather
     * than adding to it — verified against `Store.fromMethod`, which reports
     * `{ method: 'DEVICE' }` here and `{ method: 'IDP' }` on its neighbours. So
     * this route admits the map and refuses a person's token, and every other
     * route does the reverse.
     *
     * That asymmetry is the point. The device's credential lives in flash on a
     * board that talks plain HTTP over the LAN, so it is the credential most
     * likely to leak — and it reaches exactly one read of public radar data.
     */
    @Authenticate(AuthMethod.Device)
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
