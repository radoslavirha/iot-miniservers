import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import type { MongooseModel } from '@tsed/mongoose';
import { MongoRepository, MongoCreate, MongoUpdate } from '@radoslavirha/tsed-mongoose';
import { QrCodeMongoDTO } from './dto/QrCodeMongoDTO.js';
import { QrType } from '../../models/QrType.enum.js';

export interface QrCodeListFilter {
    type?: QrType;
    active?: boolean;
}

/**
 * DTO-level MongoDB repository for QR code mappings.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeMongoRepository extends MongoRepository<QrCodeMongoDTO> {
    @Inject(QrCodeMongoDTO) protected model: MongooseModel<QrCodeMongoDTO>;
    protected mongo = QrCodeMongoDTO;

    public async findAll(filter: QrCodeListFilter = {}): Promise<QrCodeMongoDTO[]> {
        const query: Pick<Partial<QrCodeMongoDTO>, 'type' | 'active'> = {};
        if (filter.type !== undefined) {
            query.type = filter.type;
        }
        if (filter.active !== undefined) {
            query.active = filter.active;
        }
        const results = await this.model.find(query).lean<QrCodeMongoDTO[]>();
        return this.deserializeArray(results);
    }

    public async findById(id: string): Promise<QrCodeMongoDTO | null> {
        const result = await this.model.findById(id).lean<QrCodeMongoDTO>();
        return this.deserialize(result);
    }

    public async findBySlug(slug: string): Promise<QrCodeMongoDTO | null> {
        const result = await this.model.findOne({ slug }).lean<QrCodeMongoDTO>();
        return this.deserialize(result);
    }

    public async create(data: MongoCreate<QrCodeMongoDTO>): Promise<QrCodeMongoDTO> {
        const doc = await this.model.create(data);
        return this.deserialize(this.convertHydratedDocumentToObject(doc));
    }

    public async updateById(id: string, data: MongoUpdate<QrCodeMongoDTO>): Promise<QrCodeMongoDTO | null> {
        const result = await this.model.findByIdAndUpdate(
            id,
            { $set: data },
            { returnDocument: 'after' }
        ).lean<QrCodeMongoDTO>();
        return this.deserialize(result);
    }

    public async deleteById(id: string): Promise<void> {
        await this.model.findByIdAndDelete(id);
    }
}
