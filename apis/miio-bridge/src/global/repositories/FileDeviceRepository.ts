import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { ConfigService } from '../services/ConfigService.js';
import { CachedDevice, IDeviceRepository } from './IDeviceRepository.js';

type CacheFile = { devices: CachedDevice[] };

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class FileDeviceRepository implements IDeviceRepository {
    private readonly cachePath: string;

    constructor(private readonly config: ConfigService) {
        this.cachePath = resolve(process.cwd(), config.config.cachePath ?? './cache/devices.json');
    }

    async getAll(): Promise<CachedDevice[]> {
        return (await this.readCache()).devices;
    }

    async getById(deviceId: number): Promise<CachedDevice | undefined> {
        const cache = await this.readCache();
        return cache.devices.find(d => d.deviceId === deviceId);
    }

    async upsert(device: CachedDevice): Promise<void> {
        const cache = await this.readCache();
        const index = cache.devices.findIndex(d => d.deviceId === device.deviceId);
        if (index >= 0) {
            cache.devices[index] = device;
        } else {
            cache.devices.push(device);
        }
        await this.writeCache(cache);
    }

    private async readCache(): Promise<CacheFile> {
        if (!existsSync(this.cachePath)) {
            return { devices: [] };
        }
        const raw = await readFile(this.cachePath, 'utf-8');
        return JSON.parse(raw) as CacheFile;
    }

    private async writeCache(cache: CacheFile): Promise<void> {
        await mkdir(dirname(this.cachePath), { recursive: true });
        await writeFile(this.cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    }
}
