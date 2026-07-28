import { EventEmitter } from 'node:events';
import { runInContext, type DIContext } from '@tsed/di';
import { describe, expect, it } from 'vitest';
import { RequestCancellation } from './RequestCancellation.js';

/**
 * Instantiates the provider and runs its `$onInit` inside a mocked DI context
 * carrying `request.raw`, mirroring how Ts.ED resolves a request-scoped provider.
 */
async function buildCancellation(raw: EventEmitter | undefined): Promise<RequestCancellation> {
    const cancellation = new RequestCancellation();
    const ctx = { request: { raw } } as unknown as DIContext;
    await runInContext(ctx, () => cancellation.$onInit());
    return cancellation;
}

describe('RequestCancellation', () => {
    it('exposes a non-aborted signal by default', async () => {
        const cancellation = await buildCancellation(new EventEmitter());
        expect(cancellation.signal).toBeInstanceOf(AbortSignal);
        expect(cancellation.signal.aborted).toBe(false);
    });

    it('aborts the signal when the request closes', async () => {
        const raw = new EventEmitter();
        const cancellation = await buildCancellation(raw);

        raw.emit('close');
        expect(cancellation.signal.aborted).toBe(true);
    });

    it('aborts the signal when the request is aborted', async () => {
        const raw = new EventEmitter();
        const cancellation = await buildCancellation(raw);

        raw.emit('aborted');
        expect(cancellation.signal.aborted).toBe(true);
    });

    it('tolerates a context without a raw request', async () => {
        const cancellation = await buildCancellation(undefined);
        expect(cancellation.signal.aborted).toBe(false);
    });

    it('abort() is idempotent', async () => {
        const cancellation = await buildCancellation(new EventEmitter());
        cancellation.abort();
        cancellation.abort();
        expect(cancellation.signal.aborted).toBe(true);
    });

    it('withTimeout aborts after the given delay', async () => {
        const cancellation = await buildCancellation(new EventEmitter());
        const signal = cancellation.withTimeout(10);

        expect(signal.aborted).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(signal.aborted).toBe(true);
    });

    it('withTimeout aborts immediately when the request already closed', async () => {
        const raw = new EventEmitter();
        const cancellation = await buildCancellation(raw);
        raw.emit('close');

        const signal = cancellation.withTimeout(10_000);
        expect(signal.aborted).toBe(true);
    });

    it('binds request listeners when signal is accessed without calling $onInit', async () => {
        const raw = new EventEmitter();
        const cancellation = new RequestCancellation();
        const ctx = { request: { raw } } as unknown as DIContext;

        await runInContext(ctx, async () => {
            void cancellation.signal;
            raw.emit('close');
            expect(cancellation.signal.aborted).toBe(true);
        });
    });
});
