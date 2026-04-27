import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import { DeviceNotification } from '../models/notifications/DeviceNotification.js';
import { DeviceNotificationMongoRepository } from '../storage/notification-mongo/DeviceNotificationMongoRepository.js';
import { MongoNotificationMapper } from '../mappers/MongoNotificationMapper.js';
import { CommonUtils } from '@radoslavirha/utils';

/**
 * Orchestration service for MongoDB-backed notification subscription storage.
 * Bridges DeviceNotificationMongoRepository (DTO level) with domain model using MongoNotificationMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceNotificationMongoService {
    @Inject(DeviceNotificationMongoRepository)
    private repository: DeviceNotificationMongoRepository;

    @Inject(MongoNotificationMapper)
    private mapper: MongoNotificationMapper;

    public async getAll(): Promise<DeviceNotification[]> {
        const dtos = await this.repository.findAll();
        return dtos.map(dto => this.mapper.mongoToModel(dto));
    }

    public async getById(id: string): Promise<DeviceNotification | undefined> {
        const dto = await this.repository.findById(id);
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mongoToModel(dto);
    }

    public async getAllByDeviceId(deviceId: string): Promise<DeviceNotification[]> {
        const dtos = await this.repository.findAllByDeviceId(deviceId);
        return dtos.map(dto => this.mapper.mongoToModel(dto));
    }

    public async create(notification: Omit<DeviceNotification, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeviceNotification> {
        const dto = await this.repository.create(this.mapper.buildMongoCreate(notification));
        return this.mapper.mongoToModel(dto);
    }

    public async deleteById(id: string): Promise<void> {
        await this.repository.deleteById(id);
    }

    public async deleteAllByDeviceId(deviceId: string): Promise<void> {
        await this.repository.deleteAllByDeviceId(deviceId);
    }
}
