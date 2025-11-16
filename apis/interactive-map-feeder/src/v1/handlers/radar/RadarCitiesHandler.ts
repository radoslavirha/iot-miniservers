import { Injectable, ProviderScope, Scope } from '@tsed/di';
import { RadarService } from '../../services/index.js';
import { RadarCitiesResponse } from '../../models/index.js';
import { CommonUtils } from '@radoslavirha/utils';

@Injectable()
@Scope(ProviderScope.REQUEST)
export class RadarCitiesHandler {
    constructor(
        private radarService: RadarService
    ) {}

    public async execute(radius?: number): Promise<RadarCitiesResponse> {
        return CommonUtils.buildModel(RadarCitiesResponse, {
            cities: await this.radarService.getCitiesConditions(radius)
        });
    }
}