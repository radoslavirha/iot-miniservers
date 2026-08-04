import { describe, expect, it, vi } from 'vitest';
import { isBrokenCircuitError, isTaskCancelledError } from './errors.js';
import { createResiliencePolicy } from './ResiliencePolicy.js';

describe('createResiliencePolicy', () => {
    it('runs the function and provides an AbortSignal when no policies are configured', async () => {
        const policy = createResiliencePolicy();
        let received: AbortSignal | undefined;

        const result = await policy.execute(async (signal) => {
            received = signal;
            return 'ok';
        });

        expect(result).toBe('ok');
        expect(received).toBeInstanceOf(AbortSignal);
        expect(policy.breaker).toBeUndefined();
    });

    it('forwards an aborted parent signal', async () => {
        const policy = createResiliencePolicy();
        const controller = new AbortController();
        controller.abort();

        let aborted = false;
        await policy.execute(async (signal) => {
            aborted = signal.aborted;
            return undefined;
        }, controller.signal);

        expect(aborted).toBe(true);
    });

    describe('timeout', () => {
        it('keeps the signal usable after successful timeout-backed work returns', async () => {
            const policy = createResiliencePolicy({ timeout: { ms: 1000 } });
            let operationSignal: AbortSignal | undefined;

            await expect(policy.execute(async (signal) => {
                operationSignal = signal;
                return 'ok';
            })).resolves.toBe('ok');

            expect(operationSignal).toBeInstanceOf(AbortSignal);
            expect(operationSignal?.aborted).toBe(false);
        });

        it('rejects with a task-cancelled error and aborts the signal when the work hangs', async () => {
            const policy = createResiliencePolicy({ timeout: { ms: 20 } });
            let captured: AbortSignal | undefined;

            const promise = policy.execute((signal) => {
                captured = signal;
                return new Promise<never>(() => {
                    // never resolves — let the timeout fire
                });
            });

            await expect(promise).rejects.toSatisfy(isTaskCancelledError);
            expect(captured?.aborted).toBe(true);
        });

        it('fires the onTimeout hook', async () => {
            const onTimeout = vi.fn();
            const policy = createResiliencePolicy({ timeout: { ms: 20 } }, { hooks: { onTimeout } });

            await expect(policy.execute(() => new Promise<never>(() => {}))).rejects.toBeDefined();
            expect(onTimeout).toHaveBeenCalledOnce();
        });
    });

    describe('retry', () => {
        it('retries failing calls up to count and then rejects', async () => {
            const policy = createResiliencePolicy({ retry: { count: 2, backoffMs: 0 } });
            const fn = vi.fn(async () => {
                throw new Error('boom');
            });

            await expect(policy.execute(fn)).rejects.toThrow('boom');
            expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
        });

        it('does not retry when count is 0', async () => {
            const policy = createResiliencePolicy({ retry: { count: 0, backoffMs: 0 } });
            const fn = vi.fn(async () => {
                throw new Error('boom');
            });

            await expect(policy.execute(fn)).rejects.toThrow('boom');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('only retries errors accepted by shouldHandle', async () => {
            const policy = createResiliencePolicy(
                { retry: { count: 3, backoffMs: 0 } },
                { shouldHandle: (error) => (error as Error).message === 'transient' }
            );

            const transient = vi.fn(async () => {
                throw new Error('transient');
            });
            const fatal = vi.fn(async () => {
                throw new Error('fatal');
            });

            await expect(policy.execute(transient)).rejects.toThrow('transient');
            expect(transient).toHaveBeenCalledTimes(4); // retried

            await expect(policy.execute(fatal)).rejects.toThrow('fatal');
            expect(fatal).toHaveBeenCalledTimes(1); // not retried
        });

        it('fires the onRetry hook with attempt details', async () => {
            const onRetry = vi.fn();
            const policy = createResiliencePolicy({ retry: { count: 1, backoffMs: 0 } }, { hooks: { onRetry } });

            await expect(
                policy.execute(async () => {
                    throw new Error('boom');
                })
            ).rejects.toThrow('boom');

            expect(onRetry).toHaveBeenCalledOnce();
            expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: expect.any(Number), delay: expect.any(Number) });
        });
    });

    describe('circuit breaker', () => {
        it('exposes the breaker and short-circuits when open, firing break/reset hooks', async () => {
            const onBreak = vi.fn();
            const onReset = vi.fn();
            const onHalfOpen = vi.fn();
            const policy = createResiliencePolicy(
                { circuitBreaker: {} },
                { hooks: { onBreak, onReset, onHalfOpen } }
            );

            expect(policy.breaker).toBeDefined();
            const handle = policy.breaker!.isolate();

            await expect(policy.execute(async () => 'ok')).rejects.toSatisfy(isBrokenCircuitError);
            expect(onBreak).toHaveBeenCalled();

            handle.dispose();
            expect(onReset).toHaveBeenCalled();
            await expect(policy.execute(async () => 'ok')).resolves.toBe('ok');
        });

        it('executes normally while the breaker is closed', async () => {
            const policy = createResiliencePolicy({ circuitBreaker: {} });
            await expect(policy.execute(async () => 'ok')).resolves.toBe('ok');
        });
    });

    it('composes retry, breaker and timeout together', async () => {
        const policy = createResiliencePolicy({
            retry: { count: 1, backoffMs: 0 },
            circuitBreaker: {},
            timeout: { ms: 50 }
        });

        await expect(policy.execute(async () => 42)).resolves.toBe(42);
        expect(policy.breaker).toBeDefined();
    });
});
