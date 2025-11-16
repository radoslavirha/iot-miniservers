import { ProviderScope, Scope, Service } from '@tsed/di';
import axios from 'axios';
import { CommonUtils, NumberUtils } from '@radoslavirha/utils';
import { CITIES } from '../cities.js';
import { BBox, CityLED, Coordinates } from '../models/index.js';
import { CHMIService } from './CHMIService.js';
import { RasterService } from './RasterService.js';

@Service()
@Scope(ProviderScope.SINGLETON)
export class RadarService extends CHMIService {
    public bbox: BBox = CommonUtils.buildModel(BBox, {
        topLeft: CommonUtils.buildModel(Coordinates, {
            latitude: 52.167,
            longitude: 11.267
        }),
        bottomRight: CommonUtils.buildModel(Coordinates, {
            latitude: 48.1,
            // latitude: 48.047,
            longitude: 20.770
        })
    });

    constructor (
        private rasterService: RasterService
    ) {
        super();
    }

    public async getCurrentRainSituation(): Promise<Buffer> {
        const url = `https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png_masked/pacz2gmaps3.z_max3d.${this.getCurrentDate()}.0.png`;
        const response = await axios<Buffer>({ method: 'GET', url, responseType: 'arraybuffer' });
        return response.data;
    }

    public async getCitiesConditions(radius?: number): Promise<CityLED[]> {
        const buffer = await this.getCurrentRainSituation();
        const image = this.rasterService.createImage(buffer);

        const cities = CommonUtils.cloneDeep(CITIES);
        const citiesLED: CityLED[] = [];

        for (const city of cities) {
            const color = await this.rasterService.getRGBAOnCoordinates(city.latitude, city.longitude, this.bbox, image.clone(), radius);

            // TODO: Implement color mapping. Now I return exact color from radar, I need more suitable colors for LEDs?
            citiesLED.push(CommonUtils.buildModel(CityLED, {
                ...city,
                color
            }));
        }

        return citiesLED;
    }

    protected getCurrentDate(): string {
        const date = new Date();
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-based
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        // image is generated every 5 minutes, floor down to nearest 5 minutes
        const minute = String(NumberUtils.floor(date.getUTCMinutes() / 5) * 5).padStart(2, '0');
      
        return `${year}${month}${day}.${hour}${minute}`;
    };
}