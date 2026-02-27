import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { DeviceCache } from '../../global/models/DeviceCache.js';
import { MiotSpecV2 } from '../../global/models/miot-spec-v2/index.js';
import { SimplifiedMiotSpec } from '../models/simplified-miot-spec/SimplifiedMiotSpec.js';
import { DeviceDiscoverResponse } from '../models/DeviceDiscoverResponse.js';
import { DeviceGetResponse } from '../models/DeviceGetResponse.js';
import { DevicePostResponse } from '../models/DevicePostResponse.js';

/** Fields required to build a DeviceCache for persistence (no id — assigned by storage). */
type CacheParams = {
    deviceId: number;
    address: string;
    token: string;
    stamp: number;
    model: string;
    specURL: string;
    rawSpec: MiotSpecV2;
};

/** Subset of DeviceCache fields used by the discover response (not persisted, no id/stamp). */
type DiscoverParams = Pick<DeviceCache, 'deviceId' | 'address' | 'token' | 'model' | 'specURL'>;

/**
 * Maps DeviceCache domain models to v1 HTTP response models, and builds DeviceCache
 * instances from discovery results for persistence.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceV1Mapper extends MappingUtils {

    /** Build a DeviceCache for upsert. The id is assigned by the storage layer. */
    buildCache(params: CacheParams): DeviceCache {
        return CommonUtils.buildModel(DeviceCache, {
            ...params,
            stampUpdatedAt: Date.now()
        });
    }

    mapCacheToGetResponse(device: DeviceCache, spec: SimplifiedMiotSpec): DeviceGetResponse {
        return CommonUtils.buildModel(DeviceGetResponse, {
            ...this.deviceFields(device),
            spec
        });
    }

    mapCacheToPostResponse(device: DeviceCache, spec: SimplifiedMiotSpec): DevicePostResponse {
        return CommonUtils.buildModel(DevicePostResponse, {
            ...this.deviceFields(device),
            spec
        });
    }

    mapDiscoveryToDiscoverResponse(params: DiscoverParams, spec: SimplifiedMiotSpec): DeviceDiscoverResponse {
        return CommonUtils.buildModel(DeviceDiscoverResponse, {
            ...params,
            spec
        });
    }

    private deviceFields(device: DeviceCache) {
        return {
            id: device.id,
            deviceId: device.deviceId,
            address: device.address,
            token: device.token,
            stamp: device.stamp,
            stampUpdatedAt: device.stampUpdatedAt,
            model: device.model,
            specURL: device.specURL
        };
    }
}
