import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { DeviceCache } from '../models/DeviceCache.js';
import { SimplifiedMiotSpec } from '../models/simplified-miot-spec/SimplifiedMiotSpec.js';
import { DeviceWithSpec } from '../models/DeviceWithSpec.js';

/**
 * Maps DeviceCache domain models to HTTP response models, and builds DeviceCache
 * instances from discovery results for persistence.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceMapper extends MappingUtils {

    public mapCacheToDeviceWithSpec(device: DeviceCache, spec: SimplifiedMiotSpec): DeviceWithSpec {
        return CommonUtils.buildModelStrict(DeviceWithSpec, {
            id: device.id,
            deviceId: device.deviceId,
            address: device.address,
            token: device.token,
            stamp: device.stamp,
            stampUpdatedAt: device.stampUpdatedAt,
            model: device.model,
            specURL: device.specURL,
            createdAt: device.createdAt,
            updatedAt: device.updatedAt,
            spec
        });
    }
}
