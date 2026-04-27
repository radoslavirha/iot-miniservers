import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import { DeviceCache } from '../models/DeviceCache.js';
import { DeviceLocalStorageRepository } from '../storage/device-local-storage/DeviceLocalStorageRepository.js';
import { FileDeviceMapper } from '../mappers/FileDeviceMapper.js';
import { CommonUtils } from '@radoslavirha/utils';

/**
 * Orchestration service for file-backed device storage.
 * Bridges DeviceLocalStorageRepository (DTO level) with domain model using FileDeviceMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceLocalStorageService {
    @Inject(DeviceLocalStorageRepository)
    private repository: DeviceLocalStorageRepository;

    @Inject(FileDeviceMapper)
    private mapper: FileDeviceMapper;

    public async getAll(): Promise<DeviceCache[]> {
        const dtos = await this.repository.getAll();
        return Promise.all(dtos.map(dto => this.mapper.mapDTOToModel(dto)));
    }

    public async getById(id: string): Promise<DeviceCache | undefined> {
        const dto = await this.repository.getById(id);
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mapDTOToModel(dto);
    }

    public async getByDeviceId(deviceId: number): Promise<DeviceCache | undefined> {
        const dto = await this.repository.getByDeviceId(deviceId);
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mapDTOToModel(dto);
    }

    public async create(device: Omit<DeviceCache, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeviceCache> {
        const dto = await this.repository.create(await this.mapper.mapModelToCreateDTO(device));
        return this.mapper.mapDTOToModel(dto);
    }

    public async update(device: DeviceCache): Promise<DeviceCache> {
        const dto = await this.repository.update(await this.mapper.mapModelToDTO(device));
        return this.mapper.mapDTOToModel(dto);
    }

    public async delete(id: string): Promise<void> {
        await this.repository.delete(id);
    }
}
