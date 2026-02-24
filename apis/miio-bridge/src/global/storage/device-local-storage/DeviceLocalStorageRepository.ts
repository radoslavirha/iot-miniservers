import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { Serializer } from '@radoslavirha/tsed-common';
import { ConfigService } from '../../services/ConfigService.js';
import { DeviceLocalStorageDTO } from './dto/DeviceLocalStorageDTO.js';

/**
 * Raw DTO-level file repository. Reads and writes DeviceLocalStorageDTO objects to disk.
 * No domain knowledge — mapping is handled by DeviceLocalStorageService.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceLocalStorageRepository {
    private readonly filePath: string;

    constructor(readonly config: ConfigService) {
        this.filePath = resolve(process.cwd(), config.config.cachePath ?? './cache/devices.json');
    }

    async getAll(): Promise<DeviceLocalStorageDTO[]> {
        return this.read();
    }

    async getById(deviceId: number): Promise<DeviceLocalStorageDTO | undefined> {
        const devices = await this.read();
        return devices.find(d => d.deviceId === deviceId);
    }

    async upsert(dto: DeviceLocalStorageDTO): Promise<void> {
        const devices = await this.read();
        const index = devices.findIndex(d => d.deviceId === dto.deviceId);
        if (index >= 0) {
            devices[index] = dto;
        } else {
            devices.push(dto);
        }
        await this.write(devices);
    }

    private async read(): Promise<DeviceLocalStorageDTO[]> {
        if (!existsSync(this.filePath)) {
            return [];
        }
        const raw = await readFile(this.filePath, 'utf-8');
        return Serializer.deserializeArray(JSON.parse(raw), DeviceLocalStorageDTO);
    }

    private async write(devices: DeviceLocalStorageDTO[]): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(Serializer.serialize(devices, Array), null, 2), 'utf-8');
    }
}
