import { Service, Scope, ProviderScope } from '@tsed/di';
import { MiotSpec } from '../../global/models/miio-spec-v2/index.js';
import { MiotSpecV2Endpoint } from '../../global/endpoints/miot-spec-v2/MiotSpecV2Endpoint.js';
import { MiotSpecV2Mapper } from '../../global/mappers/MiotSpecV2Mapper.js';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { SimplifiedMiotSpec } from '../models/index.js';
import { MiioLocalService } from './MiioLocalService.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/index.js';

export interface DeviceConnectionResult {
    deviceId: number;
    stamp: number;
    /** Resolved spec URL for this device type. */
    specUrl: string;
    /** Raw mapped domain spec — ready to persist in cache. */
    rawSpec: MiotSpec;
    /** Simplified spec — ready for API responses. */
    deviceSpec: SimplifiedMiotSpec;
}

/**
 * Orchestrates device-level interactions: handshake, spec resolution, and (later)
 * command dispatch, property reads, and permission checks.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class DeviceInteractionService {
    constructor(
        private readonly miioLocalService: MiioLocalService,
        private readonly miotSpecEndpoint: MiotSpecV2Endpoint,
        private readonly miotSpecMapper: MiotSpecV2Mapper,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper
    ) {}

    /**
     * Performs a handshake with the device and resolves its full spec.
     * Does not persist anything — callers decide what to do with the result.
     */
    async connect(request: DeviceRequestModel): Promise<DeviceConnectionResult> {
        const { deviceId, stamp } = await this.miioLocalService.handshake(request.address);
        const rawDto = await this.miotSpecEndpoint.fetchRaw(request.model);
        const rawSpec = await this.miotSpecMapper.mapDTOToModel(rawDto);
        const deviceSpec = await this.simplifiedMiotSpecMapper.map(rawSpec);

        return {
            deviceId,
            stamp,
            specUrl: this.miotSpecEndpoint.specUrl(rawDto.type),
            rawSpec,
            deviceSpec
        };
    }
}
