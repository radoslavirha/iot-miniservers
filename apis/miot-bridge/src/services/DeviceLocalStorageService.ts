import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceCache } from '../models/DeviceCache.js';
import { DeviceLocalStorageRepository } from '../storage/device-local-storage/DeviceLocalStorageRepository.js';
import { FileDeviceMapper } from '../mappers/FileDeviceMapper.js';

/**
 * Orchestration service for file-backed device storage.
 * Bridges DeviceLocalStorageRepository (DTO level) with domain model using FileDeviceMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceLocalStorageService {
    constructor(
        private readonly repository: DeviceLocalStorageRepository,
        private readonly mapper: FileDeviceMapper
    ) {}

    public async getAll(): Promise<DeviceCache[]> {
        const dtos = await this.repository.getAll();
        return this.mapper.mapArray(dtos, (dto) => this.mapper.mapDTOToModel(dto));
    }

    public async getById(id: string): Promise<DeviceCache | undefined> {
        const dto = await this.repository.getById(id);
        return this.mapper.mapOptionalModel(dto, (dto) => this.mapper.mapDTOToModel(dto));
    }

    public async getByDeviceId(deviceId: number): Promise<DeviceCache | undefined> {
        const dto = await this.repository.getByDeviceId(deviceId);
        return this.mapper.mapOptionalModel(dto, (dto) => this.mapper.mapDTOToModel(dto));
    }

    public async upsert(device: DeviceCache): Promise<DeviceCache> {
        const dto = await this.repository.upsert(await this.mapper.mapModelToDTO(device));
        return this.mapper.mapDTOToModel(dto);
    }

    public async delete(id: string): Promise<void> {
        await this.repository.delete(id);
    }
}
