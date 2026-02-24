import { DeviceCache } from '../models/DeviceCache.js';

export interface IDeviceStorage {
    getAll(): Promise<DeviceCache[]>;
    getById(deviceId: number): Promise<DeviceCache | undefined>;
    upsert(device: DeviceCache): Promise<void>;
}
