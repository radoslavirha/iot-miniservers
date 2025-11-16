import { Injectable, ProviderScope, Scope } from '@tsed/di';
import { RadarService, RasterService } from '../../services/index.js';

@Injectable()
@Scope(ProviderScope.REQUEST)
export class RadarImageHandler {
    constructor(
        private radarService: RadarService,
        private rasterService: RasterService
    ) {}

    public async execute(): Promise<Buffer> {
        const radarBuffer = await this.radarService.getCurrentRainSituation();
        const surfaceBuffer = await this.radarService.getSurfaceMap();
        const citiesBuffer = await this.radarService.getCitiesMap();
        const bordersBuffer = await this.radarService.getBordersMap();

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