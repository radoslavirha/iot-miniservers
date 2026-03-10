import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import type { MongooseModel } from '@tsed/mongoose';
import { Type } from '@tsed/core';
import { MongoRepository, MongoUpdate } from '@radoslavirha/tsed-mongoose';
import { DeviceMongoDTO } from './dto/DeviceMongoDTO.js';

/**
 * Raw DTO-level MongoDB repository for devices.
 * Accepts and returns DeviceMongoDTO objects only.
 * No domain knowledge — mapping is handled by MongoDeviceMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceMongoRepository extends MongoRepository<DeviceMongoDTO> {
    @Inject(DeviceMongoDTO) protected model: MongooseModel<DeviceMongoDTO>;
    protected type: Type<DeviceMongoDTO> = DeviceMongoDTO;

    public async findAll(): Promise<DeviceMongoDTO[]> {
        const results = await this.model.find({}).lean<DeviceMongoDTO[]>();
        return this.deserializeArray(results);
    }

    public async findById(id: string): Promise<DeviceMongoDTO | null> {
        const result = await this.model.findById(id).lean<DeviceMongoDTO>();
        return this.deserialize(result);
    }

    public async findByDeviceId(deviceId: number): Promise<DeviceMongoDTO | null> {
        const result = await this.model.findOne({ deviceId }).lean<DeviceMongoDTO>();
        return this.deserialize(result);
    }

    /**
     * Upserts a device by hardware deviceId.
     * Creates a new document when no match is found; updates and returns the existing document otherwise.
     * The combination of upsert:true and new:true guarantees a non-null result.
     */
    public async upsertByDeviceId(deviceId: number, data: MongoUpdate<DeviceMongoDTO>): Promise<DeviceMongoDTO> {
        const result = await this.model.findOneAndUpdate(
            { deviceId },
            { $set: data },
            { returnDocument: 'after', upsert: true }
        ).lean<DeviceMongoDTO>();
        return this.deserialize(result);
    }

    public async deleteById(id: string): Promise<void> {
        await this.model.findByIdAndDelete(id);
    }
}
