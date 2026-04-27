import { Injectable, ProviderScope, Scope } from '@tsed/di';
import { RadarImageService } from '../services/index.js';
import { DataSources } from '../DataSources.js';
import { InternalServerError } from '@tsed/exceptions';

@Injectable()
@Scope(ProviderScope.REQUEST)
export class DataSourcesImageHandler {
    constructor(
        private radarImageService: RadarImageService
    ) {}

    public async execute(dataSource: DataSources): Promise<Buffer> {
        let buffer: Buffer;

        switch (dataSource) {
            case DataSources.Radar:
                buffer = await this.radarImageService.getCurrentRadarImage();
                break;
            default:
                throw new InternalServerError(`Unhandled data source: ${dataSource}`);
        }
        return buffer;
    }
}