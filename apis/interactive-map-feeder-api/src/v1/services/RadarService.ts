import { ProviderScope, Scope, Service } from '@tsed/di';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { CITIES } from '../Cities.js';
import { BBox, CityLED, Coordinates, RGB } from '../models/index.js';
import { CHMIRadarService } from './CHMIRadarService.js';
import { RasterService } from './RasterService.js';

@Service()
@Scope(ProviderScope.SINGLETON)
export class RadarService {
    public bbox: BBox = CommonUtils.buildModelStrict(BBox, {
        topLeft: CommonUtils.buildModelStrict(Coordinates, {
            latitude: 52.167,
            longitude: 11.267
        }),
        bottomRight: CommonUtils.buildModelStrict(Coordinates, {
            latitude: 48.1,
            // latitude: 48.047,
            longitude: 20.770
        })
    });

    constructor (
        private rasterService: RasterService,
        private chmiRadarService: CHMIRadarService
    ) {}

    public async getCitiesFromRadar(radius?: number): Promise<CityLED[]> {
        const buffer = await this.chmiRadarService.getCurrentRadarSituation();
        const image = this.rasterService.createImage(buffer);

        const cities = ObjectUtils.cloneDeep(CITIES);
        const citiesLED: CityLED[] = [];

        for (const city of cities) {
            const color = await this.rasterService.getRGBAOnCoordinates(city.latitude, city.longitude, this.bbox, image.clone(), radius);

            // TODO: Implement color mapping. Now I return exact color from radar, I need more suitable colors for LEDs?
            citiesLED.push(CommonUtils.buildModelStrict(CityLED, {
                ...city,
                color: new RGB(color.r, color.g, color.b)
            }));
        }

        return citiesLED;
    }

}