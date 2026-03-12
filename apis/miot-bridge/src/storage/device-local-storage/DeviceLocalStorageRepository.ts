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
        this.filePath = resolve(process.cwd(), config.config.cachePath ?? './cache', 'devices.json');
    }

    async getAll(): Promise<DeviceLocalStorageDTO[]> {
        return this.read();
    }

    async getById(id: string): Promise<DeviceLocalStorageDTO | undefined> {
        const devices = await this.read();
        return devices.find(d => d.id === id);
    }

    async getByDeviceId(deviceId: number): Promise<DeviceLocalStorageDTO | undefined> {
        const devices = await this.read();
        return devices.find(d => d.deviceId === deviceId);
    }

    async create(dto: Omit<DeviceLocalStorageDTO, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeviceLocalStorageDTO> {
        const devices = await this.read();
        const now = new Date();
        const persisted: DeviceLocalStorageDTO = { ...dto, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
        devices.push(persisted);
        await this.write(devices);
        return persisted;
    }

    async update(dto: DeviceLocalStorageDTO): Promise<DeviceLocalStorageDTO> {
        const devices = await this.read();
        const index = devices.findIndex(d => d.id === dto.id);
        const persisted: DeviceLocalStorageDTO = { ...dto, updatedAt: new Date() };
        devices[index] = persisted;
        await this.write(devices);
        return persisted;
    }

    async delete(id: string): Promise<void> {
        const devices = await this.read();
        await this.write(devices.filter(d => d.id !== id));
    }

    async writeAll(devices: DeviceLocalStorageDTO[]): Promise<void> {
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
