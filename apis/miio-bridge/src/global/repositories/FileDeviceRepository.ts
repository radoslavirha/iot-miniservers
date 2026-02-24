import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { ConfigService } from '../services/ConfigService.js';
import { DeviceCache } from '../models/DeviceCache.js';
import { IDeviceRepository } from './IDeviceRepository.js';
import { FileDeviceMapper } from './file/FileDeviceMapper.js';
import { FileDeviceDTO } from './file/FileDeviceDTO.js';

type DeviceFile = { devices: FileDeviceDTO[] };

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class FileDeviceRepository implements IDeviceRepository {
    private readonly filePath: string;

    constructor(
        private readonly config: ConfigService,
        private readonly mapper: FileDeviceMapper
    ) {
        this.filePath = resolve(process.cwd(), config.config.cachePath ?? './cache/devices.json');
    }

    async getAll(): Promise<DeviceCache[]> {
        const file = await this.read();
        return file.devices.map(dto => this.mapper.toEntity(dto));
    }

    async getById(deviceId: number): Promise<DeviceCache | undefined> {
        const file = await this.read();
        const dto = file.devices.find(d => d.deviceId === deviceId);
        return dto ? this.mapper.toEntity(dto) : undefined;
    }

    async upsert(device: DeviceCache): Promise<void> {
        const file = await this.read();
        const dto = this.mapper.toDTO(device);
        const index = file.devices.findIndex(d => d.deviceId === dto.deviceId);
        if (index >= 0) {
            file.devices[index] = dto;
        } else {
            file.devices.push(dto);
        }
        await this.write(file);
    }

    private async read(): Promise<DeviceFile> {
        if (!existsSync(this.filePath)) {
            return { devices: [] };
        }
        const raw = await readFile(this.filePath, 'utf-8');
        return JSON.parse(raw) as DeviceFile;
    }

    private async write(file: DeviceFile): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(file, null, 2), 'utf-8');
    }
}
