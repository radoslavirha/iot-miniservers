import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { MiotDevice } from '@radoslavirha/miot-device';
import type { DeviceCache } from '../models/DeviceCache.js';
import { CommonUtils } from '@radoslavirha/utils';

/**
 * Maintains a pool of {@link MiotDevice} instances, one per registered device.
 * Acts as the bridge between the domain model (`DeviceCache`) and the
 * transport-level `MiotDevice` — the registry never performs storage I/O.
 *
 * Instances are keyed by hardware `deviceId`. On first access the instance is
 * created and seeded with the stamp stored in the device record; the internal
 * stamp-refresh logic of `MiotDevice` handles stale stamps transparently.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MiotDeviceRegistry {
    private readonly _registry = new Map<number, MiotDevice>();

    /**
     * Returns the existing `MiotDevice` instance for the device, creating and
     * seeding one from `device` if it does not yet exist.
     *
     * No I/O is performed here — the device's stamp-refresh logic handles
     * re-handshaking lazily when the cached stamp is stale.
     */
    public getOrCreate(device: DeviceCache): MiotDevice {
        const existing = this._registry.get(device.deviceId);
        if (existing) {
            return existing;
        }

        const instance = new MiotDevice({
            address: device.address,
            token: device.token,
            deviceId: device.deviceId
        });

        // Seed the stamp from whatever was last persisted in the device record.
        // If stampUpdatedAt is 0 (never refreshed), the instance will proactively
        // handshake on the first command because the age will exceed stampMaxAgeMs.
        if (CommonUtils.notNil(device.stamp)) {
            instance.setStampState({ stamp: device.stamp, updatedAt: device.stampUpdatedAt ?? 0 });
        }

        this._registry.set(device.deviceId, instance);
        return instance;
    }

    /**
     * Removes the instance associated with the given hardware device ID.
     * Should be called when a device is deleted from storage.
     */
    public remove(deviceId: number): void {
        this._registry.delete(deviceId);
    }
}
