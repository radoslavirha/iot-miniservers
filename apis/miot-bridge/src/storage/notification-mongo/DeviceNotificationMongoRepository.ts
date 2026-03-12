import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import type { MongooseModel } from '@tsed/mongoose';
import { MongoRepository, MongoCreate } from '@radoslavirha/tsed-mongoose';
import { DeviceNotificationMongoDTO } from './dto/DeviceNotificationMongoDTO.js';

/**
 * Raw DTO-level MongoDB repository for notification subscriptions.
 * Accepts and returns DeviceNotificationMongoDTO objects only.
 * No domain knowledge — mapping is handled by MongoNotificationMapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceNotificationMongoRepository extends MongoRepository<DeviceNotificationMongoDTO> {
    @Inject(DeviceNotificationMongoDTO) protected model: MongooseModel<DeviceNotificationMongoDTO>;
    protected mongo = DeviceNotificationMongoDTO;

    public async findAll(): Promise<DeviceNotificationMongoDTO[]> {
        const results = await this.model.find({}).lean<DeviceNotificationMongoDTO[]>();
        return this.deserializeArray(results);
    }

    public async findById(id: string): Promise<DeviceNotificationMongoDTO | null> {
        const result = await this.model.findById(id).lean<DeviceNotificationMongoDTO>();
        return this.deserialize(result);
    }

    public async findAllByDeviceId(deviceId: string): Promise<DeviceNotificationMongoDTO[]> {
        const results = await this.model.find({ deviceId }).lean<DeviceNotificationMongoDTO[]>();
        return this.deserializeArray(results);
    }

    public async create(data: MongoCreate<DeviceNotificationMongoDTO>): Promise<DeviceNotificationMongoDTO> {
        const doc = await this.model.create(data);
        return this.deserialize(this.convertHydratedDocumentToObject(doc));
    }

    public async deleteById(id: string): Promise<void> {
        await this.model.findByIdAndDelete(id);
    }

    public async deleteAllByDeviceId(deviceId: string): Promise<void> {
        await this.model.deleteMany({ deviceId });
    }
}
