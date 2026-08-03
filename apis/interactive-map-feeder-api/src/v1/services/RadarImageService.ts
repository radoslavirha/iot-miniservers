import { ProviderScope, Scope, Service } from '@tsed/di';
import { CHMIRadarService } from './CHMIRadarService.js';
import { CHMIService } from './CHMIService.js';
import { RadarService } from './RadarService.js';
import { RasterService } from './RasterService.js';

@Service()
@Scope(ProviderScope.SINGLETON)
export class RadarImageService {
    constructor (
        private radarService: RadarService,
        private chmiService: CHMIService,
        private chmiRadarService: CHMIRadarService,
        private rasterService: RasterService
    ) {
    }

    public async getCurrentRadarImage(): Promise<Buffer> {
        const radarBuffer = await this.chmiRadarService.getCurrentRadarSituation();
        const surfaceBuffer = await this.chmiService.getSurfaceMap();
        const citiesBuffer = await this.chmiService.getCitiesMap();
        const bordersBuffer = await this.chmiService.getBordersMap();

        const surface = this.rasterService.createImage(surfaceBuffer);
        const surfaceMetadata = await surface.metadata();

        const borders = await this.rasterService
            .createImage(bordersBuffer)
            .resize(surfaceMetadata.width, surfaceMetadata.height)
            .toBuffer();

        const cities = await this.rasterService
            .createImage(citiesBuffer)
            .resize(surfaceMetadata.width, surfaceMetadata.height)
            .toBuffer();

        const radar = await this.rasterService
            .createImage(radarBuffer)
            .resize(surfaceMetadata.width, surfaceMetadata.height)
            .toBuffer();

        const cityDots = await this.rasterService.createCitiesImage(
            surfaceMetadata.height!,
            surfaceMetadata.width!,
            this.radarService.bbox
        );
        
        const composite = await this.rasterService.compositeImages(surface, [borders, cities, radar, cityDots]);

        return composite.toBuffer();
    }
}