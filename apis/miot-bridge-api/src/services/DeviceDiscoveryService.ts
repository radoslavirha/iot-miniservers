import { Service, Scope, ProviderScope } from '@tsed/di';
import { MiotDevice } from '@radoslavirha/miot-device';
import { MiotSpecV2 } from '../models/miot-spec-v2/index.js';
import { MiotSpecV2Endpoint } from '../endpoints/miot-spec-v2/MiotSpecV2Endpoint.js';
import { MiotSpecV2Mapper } from '../mappers/MiotSpecV2Mapper.js';
import { SimplifiedMiotSpec } from '../models/simplified-miot-spec/SimplifiedMiotSpec.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/SimplifiedMiotSpecV2Mapper.js';
import { ModelPropertyOverrideService } from './ModelPropertyOverrideService.js';
import { Logger } from '@radoslavirha/tsed-logger';

/** Minimal device address info accepted by discover(). Both DeviceDiscoverRequest and DeviceRequest satisfy this. */
export interface DeviceAddressInput {
    address: string;
    token: string;
    model: string;
}

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
        private readonly miotSpecEndpoint: MiotSpecV2Endpoint,
        private readonly miotSpecMapper: MiotSpecV2Mapper,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly modelPropertyOverrideService: ModelPropertyOverrideService,
        private readonly logger: Logger
    ) {}

    async discover(request: DeviceAddressInput): Promise<DeviceDiscoveryResult> {
        const { deviceId, stamp } = await new MiotDevice({
            address: request.address,
            token: request.token,
            logger: this.logger.child('MIOT_DISCOVERY')
        }).discover();
        const rawDto = await this.miotSpecEndpoint.fetchRaw(request.model);
        const rawSpec = await this.miotSpecMapper.mapDTOToModel(rawDto);
        const overrides = await this.modelPropertyOverrideService.getByModel(request.model);
        const deviceSpec = await this.simplifiedMiotSpecMapper.map(rawSpec, overrides);

        return {
            deviceId,
            stamp,
            specUrl: this.miotSpecEndpoint.specUrl(rawDto.type),
            rawSpec,
            deviceSpec
        };
    }
}
