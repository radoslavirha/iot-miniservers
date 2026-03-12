import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
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
    @Inject(DeviceMongoRepository)
    private repository: DeviceMongoRepository;

    @Inject(MongoDeviceMapper)
    private mapper: MongoDeviceMapper;

    public async getAll(): Promise<DeviceCache[]> {
        const dtos = await this.repository.findAll();
        return Promise.all(dtos.map(dto => this.mapper.mongoToModel(dto)));
    }

    public async getById(id: string): Promise<DeviceCache | undefined> {
        const dto = await this.repository.findById(id);
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mongoToModel(dto);
    }

    public async getByDeviceId(deviceId: number): Promise<DeviceCache | undefined> {
        const dto = await this.repository.findByDeviceId(deviceId);
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mongoToModel(dto);
    }

    public async create(device: Omit<DeviceCache, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeviceCache> {
        const dto = await this.repository.create(await this.mapper.buildMongoCreate(device));
        return this.mapper.mongoToModel(dto);
    }

    public async update(device: DeviceCache): Promise<DeviceCache> {
        const updateObj = await this.mapper.buildMongoUpdate(device);
        const dto = await this.repository.updateById(device.id, updateObj);
        return this.mapper.mongoToModel(dto);
    }

    public async delete(id: string): Promise<void> {
        await this.repository.deleteById(id);
    }
}
