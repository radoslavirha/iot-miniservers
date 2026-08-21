import { Injectable, Inject, Scope, ProviderScope } from '@tsed/di';
import type { MongooseModel } from '@tsed/mongoose';
import { MongoRepository, MongoCreate, MongoUpdate } from '@radoslavirha/tsed-mongoose';
import { createResiliencePolicy, type ResiliencePolicy } from '@radoslavirha/resilience';
import { CommonUtils } from '@radoslavirha/utils';
import type { QueryOptions } from 'mongoose';
import { QrCodeMongoDTO } from './dto/QrCodeMongoDTO.js';
import { QrType } from '../../models/QrType.enum.js';

export interface QrCodeListFilter {
    type?: QrType;
    active?: boolean;
}

/** Per-call budget for the public slug lookup (the hot redirect path). */
const SLUG_LOOKUP_TIMEOUT_MS = 2000;

// mongoose 9 QueryOptions does not yet type the driver's `signal`, but the
// mongodb driver honours it at runtime — augment the options locally.
type AbortableQueryOptions = QueryOptions<QrCodeMongoDTO> & { signal?: AbortSignal };

/**
 * DTO-level MongoDB repository for QR code mappings.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeMongoRepository extends MongoRepository<QrCodeMongoDTO> {
    @Inject(QrCodeMongoDTO) protected model: MongooseModel<QrCodeMongoDTO>;
    protected mongo = QrCodeMongoDTO;

    // Shared across calls so the circuit breaker accumulates state for this
    // dependency (the breaker is only useful when its state is shared).
    private readonly slugLookup: ResiliencePolicy = createResiliencePolicy({
        timeout: { ms: SLUG_LOOKUP_TIMEOUT_MS },
        circuitBreaker: {}
    });

    public async findAll(filter: QrCodeListFilter = {}): Promise<QrCodeMongoDTO[]> {
        const query: Pick<Partial<QrCodeMongoDTO>, 'type' | 'active'> = {};
        if (CommonUtils.notUndefined(filter.type)) {
            query.type = filter.type;
        }
        if (CommonUtils.notUndefined(filter.active)) {
            query.active = filter.active;
        }
        const results = await this.model.find(query).lean<QrCodeMongoDTO[]>();
        return this.deserializeArray(results);
    }

    public async findById(id: string): Promise<QrCodeMongoDTO | null> {
        const result = await this.model.findById(id).lean<QrCodeMongoDTO>();
        return this.deserialize(result);
    }

    /**
     * Resolves a slug to its DTO under a resilience policy: a {@link
     * SLUG_LOOKUP_TIMEOUT_MS} timeout (also enforced server-side via
     * `maxTimeMS`) and a circuit breaker. An optional caller `signal` (e.g. the
     * request-lifecycle signal) is threaded down so a client disconnect aborts
     * the lookup.
     */
    public async findBySlug(slug: string, signal?: AbortSignal): Promise<QrCodeMongoDTO | null> {
        const result = await this.slugLookup.execute(
            (lookupSignal) => {
                const options: AbortableQueryOptions = { maxTimeMS: SLUG_LOOKUP_TIMEOUT_MS, signal: lookupSignal };
                return this.model.findOne({ slug }, null, options).lean<QrCodeMongoDTO>().exec();
            },
            signal
        );
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
