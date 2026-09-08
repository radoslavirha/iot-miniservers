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
     * The only route the LaskaKit map calls.
     *
     * It carries no decorator of its own: the map authenticates against the same
     * identity provider as everyone else, so from here it is an ordinary
     * caller — the class-level `@Authenticate` covers it, and its Authentik
     * application is one more row in `auth.IDP.trustedIssuers`.
     *
     * If this route ever has to admit the map and refuse a person, that is
     * `@RequireRoles` on a role the map's service account holds, not a separate
     * trust domain. The earlier `@Authenticate(AuthMethod.Device)` made the API
     * decide on the kind of caller, which is authorization wearing
     * authentication's clothes.
     */
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
