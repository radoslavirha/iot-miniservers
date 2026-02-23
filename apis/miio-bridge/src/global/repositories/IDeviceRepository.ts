import { MiotSpecDTO } from '../miio/spec/index.js';

export interface CachedDevice {
    deviceId: number;
    address: string;
    token: string;
    stamp: number;
    model: string;
    spec: MiotSpecDTO;
}

export interface IDeviceRepository {
    getAll(): Promise<CachedDevice[]>;
    getById(deviceId: number): Promise<CachedDevice | undefined>;
    upsert(device: CachedDevice): Promise<void>;
}
