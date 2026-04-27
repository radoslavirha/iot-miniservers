import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import { DeviceNotification } from '../models/notifications/DeviceNotification.js';
import { NotificationLocalStorageRepository } from '../storage/notification-local-storage/NotificationLocalStorageRepository.js';
import { FileNotificationMapper } from '../mappers/FileNotificationMapper.js';
import { CommonUtils } from '@radoslavirha/utils';

/**
 * Orchestration service for file-backed notification subscription storage.
 * Bridges NotificationLocalStorageRepository (DTO level) with domain model using FileNotificationMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationLocalStorageService {
    @Inject(NotificationLocalStorageRepository)
    private repository: NotificationLocalStorageRepository;

    @Inject(FileNotificationMapper)
    private mapper: FileNotificationMapper;

    public async getAll(): Promise<DeviceNotification[]> {
        const dtos = await this.repository.getAll();
        return Promise.all(dtos.map(dto => this.mapper.mapDTOToModel(dto)));
    }

    public async getById(id: string): Promise<DeviceNotification | undefined> {
        const dto = await this.repository.getById(id);
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mapDTOToModel(dto);
    }

    public async getAllByDeviceId(deviceId: string): Promise<DeviceNotification[]> {
        const dtos = await this.repository.getAllByDeviceId(deviceId);
        return Promise.all(dtos.map(dto => this.mapper.mapDTOToModel(dto)));
    }

    public async create(notification: Omit<DeviceNotification, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeviceNotification> {
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
