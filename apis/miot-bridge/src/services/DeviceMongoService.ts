import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceCache } from '../models/DeviceCache.js';
import { DeviceMongoRepository } from '../storage/device-mongo/DeviceMongoRepository.js';
import { MongoDeviceMapper } from '../mappers/MongoDeviceMapper.js';
import { CommonUtils } from '@radoslavirha/utils';

/**
 * Orchestration service for MongoDB-backed device storage.
 * Bridges DeviceMongoRepository (DTO level) with domain model using MongoDeviceMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceMongoService {
    constructor(
        private readonly repository: DeviceMongoRepository,
        private readonly mapper: MongoDeviceMapper
    ) {}

    public async getAll(): Promise<DeviceCache[]> {
        const dtos = await this.repository.findAll();
        return this.mapper.mapArray(dtos, (dto) => this.mapper.mapDTOToModel(dto));
    }

    public async getById(id: string): Promise<DeviceCache | undefined> {
        const dto = await this.repository.findById(id);
        if (CommonUtils.isNull(dto)) {
            return undefined;
        }
        return this.mapper.mapDTOToModel(dto);
    }

    public async getByDeviceId(deviceId: number): Promise<DeviceCache | undefined> {
        const dto = await this.repository.findByDeviceId(deviceId);
        if (CommonUtils.isNull(dto)) {
            return undefined;
        }
        return this.mapper.mapDTOToModel(dto);
    }

    public async upsert(device: DeviceCache): Promise<DeviceCache> {
        const updateObj = await this.mapper.mapModelToUpdateObj(device);
        const dto = await this.repository.upsertByDeviceId(device.deviceId, updateObj);
        return this.mapper.mapDTOToModel(dto);
    }

    public async delete(id: string): Promise<void> {
        await this.repository.deleteById(id);
    }
}
