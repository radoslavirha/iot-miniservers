import { InjectHttpClient, type HttpClient } from '@radoslavirha/tsed-http-provider';
import { ProviderScope, Scope, Service } from '@tsed/di';
import { ExternalApi } from '../../../global/models/ExternalApi.enum.js';

/**
 * Static basemap layers published by CHMI.
 *
 * @see https://opendata.chmi.cz/meteorology/weather/radar/radar_popis_cz.pdf
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class ChmiPortalEndpoint {
    @InjectHttpClient(ExternalApi.ChmiPortal)
    private readonly client!: HttpClient;

    public getSurfaceMap(): Promise<Buffer> {
        return this.client.get<Buffer>(
            '/files/portal/docs/meteo/rad/inca-cz/und/pacz2gmaps6.oro_col_40med.jpg',
            { responseType: 'binary' }
        );
    }

    public getCitiesMap(): Promise<Buffer> {
        return this.client.get<Buffer>(
            '/files/portal/docs/meteo/rad/inca-cz/und/pacz2gmaps6.und2.png',
            { responseType: 'binary' }
        );
    }

    public getBordersMap(): Promise<Buffer> {
        return this.client.get<Buffer>(
            '/files/portal/docs/meteo/rad/inca-cz/und/pacz2gmaps6.borders5.und.png',
            { responseType: 'binary' }
        );
    }
}
