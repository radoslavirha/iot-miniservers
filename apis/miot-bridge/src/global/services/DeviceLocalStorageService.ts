import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceCache } from '../models/DeviceCache.js';
import { IDeviceStorage } from './IDeviceStorage.js';
import { DeviceLocalStorageRepository } from '../storage/device-local-storage/DeviceLocalStorageRepository.js';
import { FileDeviceMapper } from '../mappers/FileDeviceMapper.js';

/**
 * Orchestration service for file-backed device storage.
 * Bridges the domain-level IDeviceStorage contract with DeviceLocalStorageRepository (DTO level)
 * using FileDeviceMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceLocalStorageService implements IDeviceStorage {
    constructor(
        private readonly repository: DeviceLocalStorageRepository,
        private readonly mapper: FileDeviceMapper
    ) {}

    public async getAll(): Promise<DeviceCache[]> {
        const dtos = await this.repository.getAll();
        return Promise.all(dtos.map(dto => this.mapper.mapDTOToModel(dto)));
    }

    public async getById(deviceId: number): Promise<DeviceCache | undefined> {
        const dto = await this.repository.getById(deviceId);
        return dto ? await this.mapper.mapDTOToModel(dto) : undefined;
    }

    public async upsert(device: DeviceCache): Promise<void> {
        await this.repository.upsert(await this.mapper.mapModelToDTO(device));
    }
}
