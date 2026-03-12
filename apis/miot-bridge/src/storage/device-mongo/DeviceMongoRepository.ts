import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import type { MongooseModel } from '@tsed/mongoose';
import { MongoRepository, MongoCreate, MongoUpdate } from '@radoslavirha/tsed-mongoose';
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
    protected mongo = DeviceMongoDTO;

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

    public async create(data: MongoCreate<DeviceMongoDTO>): Promise<DeviceMongoDTO> {
        const doc = await this.model.create(data);
        return this.deserialize(this.convertHydratedDocumentToObject(doc));
    }

    public async updateById(id: string, data: MongoUpdate<DeviceMongoDTO>): Promise<DeviceMongoDTO> {
        const result = await this.model.findByIdAndUpdate(
            id,
            { $set: data },
            { returnDocument: 'after' }
        ).lean<DeviceMongoDTO>();
        return this.deserialize(result as DeviceMongoDTO);
    }

    public async deleteById(id: string): Promise<void> {
        await this.model.findByIdAndDelete(id);
    }
}
