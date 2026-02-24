import { DeviceCache } from '../models/DeviceCache.js';

export interface IDeviceRepository {
    getAll(): Promise<DeviceCache[]>;
    getById(deviceId: number): Promise<DeviceCache | undefined>;
    upsert(device: DeviceCache): Promise<void>;
}
