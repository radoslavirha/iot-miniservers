import { TestContainersMongo } from '@tsed/testcontainers-mongo';
import mongoose, { Schema, type Model, type QueryOptions } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResiliencePolicy, type ResiliencePolicy } from './ResiliencePolicy.js';
import { isTaskCancelledError } from './errors.js';

const RETRIABLE_STATUS_CODES = new Set<number>([408, 429, 500, 502, 503, 504]);
const SLUG_LOOKUP_TIMEOUT_MS = 2000;
const MONGOOSE_MODEL_NAME = 'ResilienceQrSlug';
const MONGOOSE_COLLECTION_NAME = 'resilience_qr_slugs';

interface QrSlugDocument {
    slug: string;
    targetURL: string;
}

// mongoose 9 QueryOptions does not yet type the driver's `signal`, but the
// mongodb driver honours it at runtime — augment the options locally.
type AbortableQueryOptions = QueryOptions<QrSlugDocument> & { signal?: AbortSignal };

const buildMongooseDatabaseName = (): string => {
    const random = Math.floor(Math.random() * 1_000_000_000);
    return `resilience-integration-${Date.now()}-${random}`;
};

class HttpStatusError extends Error {
    public constructor(public readonly status: number) {
        super(`HTTP ${status}`);
    }
}

type HttpScenario<T> =
    | { kind: 'success'; value: T; delayMs?: number; onStart?: () => void }
    | { kind: 'status'; status: number; delayMs?: number; onStart?: () => void }
    | { kind: 'network'; message: string; delayMs?: number; onStart?: () => void }
    | { kind: 'never'; onStart?: () => void };

const waitForDelay = async (delayMs: number, signal: AbortSignal): Promise<void> => {
    if (delayMs <= 0) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);

        const onAbort = (): void => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(new Error('aborted'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
            onAbort();
        }
    });
};

const isRetriableHttpError = (error: unknown): boolean => {
    if (isTaskCancelledError(error)) {
        return false;
    }

    if (error instanceof HttpStatusError) {
        return RETRIABLE_STATUS_CODES.has(error.status);
    }

    return true;
};

class HttpProviderHarness<T> {
    private readonly policy: ResiliencePolicy;
    private readonly scenarios: HttpScenario<T>[];
    private attemptCount: number = 0;

    public constructor(scenarios: HttpScenario<T>[], policy: ResiliencePolicy = createResiliencePolicy({
        retry: { count: 2, backoffMs: 0 },
        timeout: { ms: 1000 },
        circuitBreaker: {}
    }, {
        shouldHandle: isRetriableHttpError
    })) {
        this.scenarios = [...scenarios];
        this.policy = policy;
    }

    public get attempts(): number {
        return this.attemptCount;
    }

    public async get(signal?: AbortSignal): Promise<T> {
        return this.policy.execute(async (requestSignal) => this.dispatch(requestSignal), signal);
    }

    private async dispatch(signal: AbortSignal): Promise<T> {
        const scenario = this.scenarios.shift();
        if (!scenario) {
            throw new Error('No HTTP scenario prepared for this call');
        }

        this.attemptCount += 1;
        scenario.onStart?.();

        if (scenario.kind === 'never') {
            return new Promise<never>(() => {
                // keep pending until caller/timeout cancels through resilience
            });
        }

        await waitForDelay(scenario.delayMs ?? 0, signal);

        if (scenario.kind === 'status') {
            throw new HttpStatusError(scenario.status);
        }

        if (scenario.kind === 'network') {
            throw new Error(scenario.message);
        }

        return scenario.value;
    }
}

interface SlugLookupOptions {
    maxTimeMS: number;
    signal: AbortSignal;
}

type SlugLookupResult = { slug: string; targetURL: string };

const createSlugLookupPolicy = (): ResiliencePolicy => createResiliencePolicy({
    timeout: { ms: SLUG_LOOKUP_TIMEOUT_MS },
    circuitBreaker: {}
}, {
    shouldHandle: (error) => !isTaskCancelledError(error)
});

let qrSlugModel: Model<QrSlugDocument>;
let holdQueryExecution: boolean = false;
let notifyQueryStarted: (() => void) | undefined;
let releaseQueryExecution: (() => void) | undefined;

const findBySlugWithPolicy = async (
    policy: ResiliencePolicy,
    slug: string,
    parentSignal?: AbortSignal
): Promise<SlugLookupResult | null> => {
    return policy.execute(
        (lookupSignal) => {
            const options: AbortableQueryOptions = { maxTimeMS: SLUG_LOOKUP_TIMEOUT_MS, signal: lookupSignal };
            return qrSlugModel.findOne({ slug }, null, options).lean<SlugLookupResult>().exec();
        },
        parentSignal
    );
};

describe('ResiliencePolicy integration use cases', () => {
    beforeAll(async () => {
        const mongo = await TestContainersMongo.startMongoServer();
        const databaseUrl = `${mongo.url}/${buildMongooseDatabaseName()}`;
        await mongoose.connect(databaseUrl, { directConnection: true });

        if (mongoose.models[MONGOOSE_MODEL_NAME]) {
            delete mongoose.models[MONGOOSE_MODEL_NAME];
        }

        const schema = new Schema<QrSlugDocument>({
            slug: { type: String, required: true, index: true },
            targetURL: { type: String, required: true }
        }, {
            collection: MONGOOSE_COLLECTION_NAME
        });

        schema.pre('findOne', async () => {
            if (!holdQueryExecution) {
                return;
            }

            notifyQueryStarted?.();

            await new Promise<void>((resolve) => {
                releaseQueryExecution = resolve;
            });
        });

        qrSlugModel = mongoose.model<QrSlugDocument>(MONGOOSE_MODEL_NAME, schema);
    }, 120_000);

    beforeEach(async () => {
        holdQueryExecution = false;
        notifyQueryStarted = undefined;
        releaseQueryExecution = undefined;

        await qrSlugModel.deleteMany({});
        await qrSlugModel.create({
            slug: 'x7k2',
            targetURL: 'https://iot-ui.home/devices/shelf-1'
        });
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await TestContainersMongo.stopMongoServer();
    }, 120_000);

    describe('HTTP-provider-like adapter', () => {
        it('retries retriable HTTP status and eventually succeeds', async () => {
            const client = new HttpProviderHarness<{ ok: true }>([
                { kind: 'status', status: 503 },
                { kind: 'success', value: { ok: true } }
            ]);

            await expect(client.get()).resolves.toEqual({ ok: true });
            expect(client.attempts).toBe(2);
        });

        it('does not retry non-retriable HTTP status', async () => {
            const client = new HttpProviderHarness<{ ok: true }>([
                { kind: 'status', status: 404 }
            ]);

            await expect(client.get()).rejects.toBeInstanceOf(HttpStatusError);
            expect(client.attempts).toBe(1);
        });

        it('cancels in-flight HTTP work from parent signal without timeout hook emission', async () => {
            const onTimeout = vi.fn();
            const client = new HttpProviderHarness<never>([
                { kind: 'never' }
            ], createResiliencePolicy({
                timeout: { ms: 1000 },
                circuitBreaker: {}
            }, {
                shouldHandle: isRetriableHttpError,
                hooks: { onTimeout }
            }));
            const parent = new AbortController();

            const pending = client.get(parent.signal);
            parent.abort();

            await expect(pending).rejects.toSatisfy(isTaskCancelledError);
            expect(onTimeout).not.toHaveBeenCalled();
        });
    });

    describe('real Mongoose slug lookup adapter', () => {
        it('resolves healthy lookup through real mongoose model', async () => {
            const policy = createSlugLookupPolicy();

            await expect(findBySlugWithPolicy(policy, 'x7k2')).resolves.toMatchObject({
                slug: 'x7k2',
                targetURL: 'https://iot-ui.home/devices/shelf-1'
            });
        });

        it('rejects immediately when parent signal is already aborted', async () => {
            const policy = createSlugLookupPolicy();
            const parent = new AbortController();
            const findOne = vi.spyOn(qrSlugModel, 'findOne');
            parent.abort();

            await expect(findBySlugWithPolicy(policy, 'x7k2', parent.signal)).rejects.toSatisfy(isTaskCancelledError);
            expect(findOne).not.toHaveBeenCalled();

            findOne.mockRestore();
        });

        it('threads maxTimeMS and signal into findOne options', async () => {
            const policy = createSlugLookupPolicy();
            const findOne = vi.spyOn(qrSlugModel, 'findOne');

            await expect(findBySlugWithPolicy(policy, 'x7k2')).resolves.toMatchObject({ slug: 'x7k2' });

            const options = findOne.mock.calls[0]?.[2] as SlugLookupOptions | undefined;
            expect(options?.maxTimeMS).toBe(SLUG_LOOKUP_TIMEOUT_MS);
            expect(options?.signal).toBeInstanceOf(AbortSignal);

            findOne.mockRestore();
        });

        it('keeps breaker healthy after repeated in-flight caller cancellations', async () => {
            const policy = createSlugLookupPolicy();
            holdQueryExecution = true;

            for (let attempt = 0; attempt < 50; attempt++) {
                const parent = new AbortController();
                const queryStarted = new Promise<void>((resolve) => {
                    notifyQueryStarted = resolve;
                });

                const pending = findBySlugWithPolicy(policy, 'x7k2', parent.signal);
                await queryStarted;
                parent.abort();

                await expect(pending).rejects.toSatisfy(isTaskCancelledError);

                releaseQueryExecution?.();
                await Promise.resolve();
            }

            holdQueryExecution = false;

            await expect(findBySlugWithPolicy(policy, 'x7k2')).resolves.toMatchObject({ slug: 'x7k2' });
        });

        it('fires onTimeout when lookup exceeds policy timeout', async () => {
            const onTimeout = vi.fn();
            const policy = createResiliencePolicy({
                timeout: { ms: 20 },
                circuitBreaker: {}
            }, {
                shouldHandle: (error) => !isTaskCancelledError(error),
                hooks: { onTimeout }
            });
            holdQueryExecution = true;

            const queryStarted = new Promise<void>((resolve) => {
                notifyQueryStarted = resolve;
            });
            const pending = findBySlugWithPolicy(policy, 'x7k2');

            await queryStarted;
            await expect(pending).rejects.toSatisfy(isTaskCancelledError);
            expect(onTimeout).toHaveBeenCalledOnce();

            releaseQueryExecution?.();
            holdQueryExecution = false;
            await Promise.resolve();
        });
    });
});
