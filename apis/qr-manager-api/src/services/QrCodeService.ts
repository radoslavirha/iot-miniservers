import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { Conflict } from '@tsed/exceptions';
import { INSERT_ATTEMPTS, MONGO_DUPLICATE_KEY } from '../constants.js';
import { QrCode } from '../models/QrCode.js';
import { MongoQrCodeMapper } from '../mappers/MongoQrCodeMapper.js';
import { QrCodeListFilter, QrCodeMongoRepository } from '../storage/qr-mongo/QrCodeMongoRepository.js';
import { ShortIdService } from './ShortIdService.js';

interface MongoLikeError {
    code?: number;
    keyPattern?: Record<string, unknown>;
}

/**
 * Domain-level service for QR code records. Bridges the Mongo repository (DTO
 * level) with the QrCode domain model via MongoQrCodeMapper, and owns the slug
 * allocation + collision-retry policy. Storage backend is an implementation
 * detail — a future swap (e.g. local-storage backend) only changes the injected
 * repository, not callers of this service.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeService {
    constructor(
        private readonly repository: QrCodeMongoRepository,
        private readonly mapper: MongoQrCodeMapper,
        private readonly shortIdService: ShortIdService
    ) {}

    public async list(filter: QrCodeListFilter = {}): Promise<QrCode[]> {
        const dtos = await this.repository.findAll(filter);
        return dtos.map(dto => this.mapper.mongoToModel(dto));
    }

    public async getById(id: string): Promise<QrCode | undefined> {
        const dto = await this.repository.findById(id);
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mongoToModel(dto);
    }

    public async getBySlug(slug: string, signal?: AbortSignal): Promise<QrCode | undefined> {
        const dto = await this.repository.findBySlug(slug, signal);
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mongoToModel(dto);
    }

    public async create(entity: Omit<QrCode, 'id' | 'createdAt' | 'updatedAt' | 'slug'>): Promise<QrCode> {
        for (let attempt = 0; attempt < INSERT_ATTEMPTS; attempt++) {
            const slug = this.shortIdService.generate();
            try {
                const dto = await this.repository.create(this.mapper.buildMongoCreate({ ...entity, slug }));
                return this.mapper.mongoToModel(dto);
            } catch (error) {
                if (!this.isSlugCollision(error)) {
                    throw error;
                }
            }
        }
        throw new Conflict(`Failed to allocate a unique slug after ${INSERT_ATTEMPTS} attempts.`);
    }

    public async update(id: string, partial: Partial<Omit<QrCode, 'id' | 'createdAt' | 'updatedAt' | 'slug'>>): Promise<QrCode | undefined> {
        const dto = await this.repository.updateById(id, this.mapper.buildMongoUpdate(partial));
        return CommonUtils.isNil(dto) ? undefined : this.mapper.mongoToModel(dto);
    }

    public async delete(id: string): Promise<void> {
        await this.repository.deleteById(id);
    }

    private isSlugCollision(error: unknown): boolean {
        const err = error as MongoLikeError;
        return err?.code === MONGO_DUPLICATE_KEY && Boolean(err.keyPattern?.slug);
    }
}
