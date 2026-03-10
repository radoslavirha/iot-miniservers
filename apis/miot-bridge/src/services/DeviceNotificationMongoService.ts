import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceNotificationCache } from '../models/DeviceNotificationCache.js';
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
    constructor(
        private readonly repository: DeviceNotificationMongoRepository,
        private readonly mapper: MongoNotificationMapper
    ) {}

    public async getAll(): Promise<DeviceNotificationCache[]> {
        const dtos = await this.repository.findAll();
        return this.mapper.mapArray(dtos, (dto) => Promise.resolve(this.mapper.mapDTOToModel(dto)));
    }

    public async getById(id: string): Promise<DeviceNotificationCache | undefined> {
        const dto = await this.repository.findById(id);
        if (CommonUtils.isNull(dto)) {
            return undefined;
        }
        return this.mapper.mapDTOToModel(dto);
    }

    public async getAllByDeviceId(deviceId: string): Promise<DeviceNotificationCache[]> {
        const dtos = await this.repository.findAllByDeviceId(deviceId);
        return this.mapper.mapArray(dtos, (dto) => Promise.resolve(this.mapper.mapDTOToModel(dto)));
    }

    public async create(notification: Omit<DeviceNotificationCache, 'id'>): Promise<DeviceNotificationCache> {
        const createObj = this.mapper.mapModelToCreateObj(notification);
        const dto = await this.repository.create(createObj);
        return this.mapper.mapDTOToModel(dto);
    }

    public async deleteById(id: string): Promise<void> {
        await this.repository.deleteById(id);
    }

    public async deleteAllByDeviceId(deviceId: string): Promise<void> {
        await this.repository.deleteAllByDeviceId(deviceId);
    }
}
