import { Service, Scope, ProviderScope } from '@tsed/di';
import { MiotSpecV2 } from '../../global/models/miot-spec-v2/index.js';
import { MiotSpecV2Endpoint } from '../../global/endpoints/miot-spec-v2/MiotSpecV2Endpoint.js';
import { MiotSpecV2Mapper } from '../../global/mappers/MiotSpecV2Mapper.js';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { SimplifiedMiotSpec } from '../models/index.js';
import { MiotDeviceClient } from './MiotDeviceClient.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/index.js';

export interface DeviceDiscoveryResult {
    deviceId: number;
    stamp: number;
    /** Resolved spec URL for this device type. */
    specUrl: string;
    /** Raw mapped domain spec — ready to persist in cache. */
    rawSpec: MiotSpecV2;
    /** Simplified spec — ready for API responses. */
    deviceSpec: SimplifiedMiotSpec;
}

/**
 * Discovers a device by address: performs a handshake and resolves its full MIoT spec.
 * Does not persist anything — callers decide what to do with the result.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class DeviceDiscoveryService {
    constructor(
        private readonly miotDeviceClient: MiotDeviceClient,
        private readonly miotSpecEndpoint: MiotSpecV2Endpoint,
        private readonly miotSpecMapper: MiotSpecV2Mapper,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper
    ) {}

    async discover(request: DeviceRequestModel): Promise<DeviceDiscoveryResult> {
        const { deviceId, stamp } = await this.miotDeviceClient.handshake(request.address);
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
