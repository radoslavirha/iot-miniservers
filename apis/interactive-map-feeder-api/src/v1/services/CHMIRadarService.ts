import { InjectHttpClient, type HttpClient } from '@radoslavirha/tsed-http-provider';
import { NumberUtils } from '@radoslavirha/utils';
import { ProviderScope, Scope, Service } from '@tsed/di';
import { ExternalApi } from '../../global/models/ExternalApi.enum.js';

/**
 * Precipitation radar composite published on ČHMÚ open data.
 *
 * @see https://opendata.chmi.cz/meteorology/weather/radar/radar_popis_cz.pdf
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class CHMIRadarService {
    @InjectHttpClient(ExternalApi.ChmiOpendata)
    private readonly client!: HttpClient;

    /** Latest radar composite image. */
    public getCurrentRadarSituation(): Promise<Buffer> {
        return this.client.get<Buffer>(
            `/meteorology/weather/radar/composite/maxz/png_masked/pacz2gmaps3.z_max3d.${this.getCurrentDate()}.0.png`,
            { responseType: 'binary' }
        );
    }

    /**
     * Timestamp segment of the image filename. Images are published every five
     * minutes, so the current time is floored to the nearest five.
     */
    private getCurrentDate(): string {
        const date = new Date();
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-based
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(NumberUtils.floor(date.getUTCMinutes() / 5) * 5).padStart(2, '0');

        return `${year}${month}${day}.${hour}${minute}`;
    }
}
