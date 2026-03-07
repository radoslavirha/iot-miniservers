import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceNotificationCache } from '../models/DeviceNotificationCache.js';
import { NotificationLocalStorageRepository } from '../storage/notification-local-storage/NotificationLocalStorageRepository.js';
import { FileNotificationMapper } from '../mappers/FileNotificationMapper.js';

/**
 * Orchestration service for file-backed notification subscription storage.
 * Bridges NotificationLocalStorageRepository (DTO level) with domain model using FileNotificationMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationLocalStorageService {
    constructor(
        private readonly repository: NotificationLocalStorageRepository,
        private readonly mapper: FileNotificationMapper
    ) {}

    public async getAll(): Promise<DeviceNotificationCache[]> {
        const dtos = await this.repository.getAll();
        return this.mapper.mapArray(dtos, (dto) => this.mapper.mapDTOToModel(dto));
    }

    public async getById(id: string): Promise<DeviceNotificationCache | undefined> {
        const dto = await this.repository.getById(id);
        return this.mapper.mapOptionalModel(dto, (dto) => this.mapper.mapDTOToModel(dto));
    }

    public async getAllByDeviceId(deviceId: string): Promise<DeviceNotificationCache[]> {
        const dtos = await this.repository.getAllByDeviceId(deviceId);
        return this.mapper.mapArray(dtos, (dto) => this.mapper.mapDTOToModel(dto));
    }

    public async create(notification: Omit<DeviceNotificationCache, 'id'>): Promise<DeviceNotificationCache> {
        const dto = await this.repository.create(await this.mapper.mapModelToDTO(notification));
        return this.mapper.mapDTOToModel(dto);
    }

    public async deleteById(id: string): Promise<void> {
        await this.repository.deleteById(id);
    }

    public async deleteAllByDeviceId(deviceId: string): Promise<void> {
        await this.repository.deleteAllByDeviceId(deviceId);
    }
}
