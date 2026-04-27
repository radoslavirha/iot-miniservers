import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { MongoMapper, MongoCreate, MongoUpdate } from '@radoslavirha/tsed-mongoose';
import { QrCode } from '../models/QrCode.js';
import { QrCodeMongoDTO } from '../storage/qr-mongo/dto/QrCodeMongoDTO.js';

/**
 * Bi-directional mapper between QrCodeMongoDTO and the QrCode domain model.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MongoQrCodeMapper extends MongoMapper<QrCodeMongoDTO, QrCode> {
    protected mongo = QrCodeMongoDTO;
    protected model = QrCode;

    public mongoToModel(mongo: QrCodeMongoDTO): QrCode {
        return CommonUtils.buildModelStrict(QrCode, {
            ...this.mongoToModelBase(mongo),
            slug: mongo.slug,
            targetURL: mongo.targetURL,
            label: mongo.label,
            type: mongo.type,
            active: mongo.active
        });
    }

    public buildMongoCreate(entity: Omit<QrCode, 'id' | 'createdAt' | 'updatedAt'>): MongoCreate<QrCodeMongoDTO> {
        return this.buildMongoPayload({
            slug: entity.slug,
            targetURL: entity.targetURL,
            label: entity.label,
            type: entity.type,
            active: entity.active
        });
    }

    public buildMongoUpdate(entity: Partial<Omit<QrCode, 'id' | 'createdAt' | 'updatedAt'>>): MongoUpdate<QrCodeMongoDTO> {
        return this.buildMongoUpdatePayload(entity);
    }
}
