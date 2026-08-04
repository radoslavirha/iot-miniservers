import { getEventListeners } from 'node:events';
import { CircuitState } from 'cockatiel';
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

    it('rejects without invoking work when the parent signal is already aborted', async () => {
        const policy = createResiliencePolicy();
        const controller = new AbortController();
        controller.abort();
        const fn = vi.fn(async () => undefined);

        await expect(policy.execute(fn, controller.signal)).rejects.toSatisfy(isTaskCancelledError);
        expect(fn).not.toHaveBeenCalled();
    });

    it('does not invoke queued work after immediate parent cancellation', async () => {
        const policy = createResiliencePolicy();
        const controller = new AbortController();
        const fn = vi.fn(async () => undefined);
        const pending = policy.execute(fn, controller.signal);

        controller.abort();

        await expect(pending).rejects.toSatisfy(isTaskCancelledError);
        await Promise.resolve();
        expect(fn).not.toHaveBeenCalled();
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

        it('does not fire the onTimeout hook when the parent signal aborts', async () => {
            const controller = new AbortController();
            const onTimeout = vi.fn();
            let operationSignal: AbortSignal | undefined;
            let notifyOperationStarted: (() => void) | undefined;
            const operationStarted = new Promise<void>((resolve) => {
                notifyOperationStarted = resolve;
            });
            const policy = createResiliencePolicy(
                { timeout: { ms: 1000 } },
                { hooks: { onTimeout } }
            );

            const pending = policy.execute((signal) => {
                operationSignal = signal;
                notifyOperationStarted?.();
                return new Promise<never>(() => {});
            }, controller.signal);
            await operationStarted;
            controller.abort();

            await expect(pending).rejects.toSatisfy(isTaskCancelledError);
            expect(operationSignal?.aborted).toBe(true);
            expect(onTimeout).not.toHaveBeenCalled();
        });

        it('removes the parent abort listener when non-settling work times out', async () => {
            const controller = new AbortController();
            const policy = createResiliencePolicy({ timeout: { ms: 20 } });
            const initialListenerCount = getEventListeners(controller.signal, 'abort').length;

            await expect(
                policy.execute(() => new Promise<never>(() => {}), controller.signal)
            ).rejects.toSatisfy(isTaskCancelledError);

            expect(getEventListeners(controller.signal, 'abort')).toHaveLength(initialListenerCount);
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

        it('does not invoke shouldHandle without retry or circuit breaker', async () => {
            const operationError = new Error('operation failed');
            const shouldHandle = vi.fn(() => {
                throw new Error('classifier failed');
            });
            const policy = createResiliencePolicy(
                { timeout: { ms: 1000 } },
                { shouldHandle }
            );

            await expect(policy.execute(async () => {
                throw operationError;
            })).rejects.toBe(operationError);

            expect(shouldHandle).not.toHaveBeenCalled();
        });

        it('uses shouldHandle for circuit breaker accounting when retry is disabled', async () => {
            const shouldHandle = vi.fn(() => false);
            const policy = createResiliencePolicy(
                {
                    circuitBreaker: {
                        minimumThroughput: 1,
                        samplingDurationMs: 1000,
                        threshold: 0.5
                    }
                },
                { shouldHandle }
            );

            await expect(policy.execute(async () => {
                throw new Error('dependency failed');
            })).rejects.toThrow('dependency failed');

            expect(shouldHandle).toHaveBeenCalledOnce();
            expect(policy.breaker?.state).toBe(CircuitState.Closed);
        });

        it('cancels an active retry backoff without another attempt', async () => {
            const controller = new AbortController();
            const fn = vi.fn(async () => {
                throw new Error('transient');
            });
            let notifyBackoffStarted: (() => void) | undefined;
            const backoffStarted = new Promise<void>((resolve) => {
                notifyBackoffStarted = resolve;
            });
            const policy = createResiliencePolicy(
                { retry: { count: 1, backoffMs: 100 } },
                {
                    hooks: {
                        onRetry: () => queueMicrotask(() => notifyBackoffStarted?.())
                    }
                }
            );

            const pending = policy.execute(fn, controller.signal);
            await backoffStarted;
            controller.abort();

            await expect(pending).rejects.toSatisfy(isTaskCancelledError);
            expect(fn).toHaveBeenCalledOnce();
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

        it('does not open the breaker after parent cancellations', async () => {
            const policy = createResiliencePolicy({
                timeout: { ms: 1000 },
                circuitBreaker: {}
            });

            for (let attempt = 0; attempt < 50; attempt++) {
                const controller = new AbortController();
                let notifyOperationStarted: (() => void) | undefined;
                const operationStarted = new Promise<void>((resolve) => {
                    notifyOperationStarted = resolve;
                });
                const pending = policy.execute(() => {
                    notifyOperationStarted?.();
                    return new Promise<never>(() => {});
                }, controller.signal);
                await operationStarted;
                controller.abort();

                await expect(pending).rejects.toSatisfy(isTaskCancelledError);
            }

            await expect(policy.execute(async () => 'ok')).resolves.toBe('ok');
        });

        it('keeps a half-open breaker open after parent cancellation', async () => {
            const policy = createResiliencePolicy({
                circuitBreaker: {
                    halfOpenAfterMs: 0,
                    minimumThroughput: 1,
                    samplingDurationMs: 1000,
                    threshold: 0.5
                }
            });

            await expect(policy.execute(async () => {
                throw new Error('dependency failed');
            })).rejects.toThrow('dependency failed');
            expect(policy.breaker?.state).toBe(CircuitState.Open);

            const controller = new AbortController();
            let notifyProbeStarted: (() => void) | undefined;
            const probeStarted = new Promise<void>((resolve) => {
                notifyProbeStarted = resolve;
            });
            const probe = policy.execute(() => {
                notifyProbeStarted?.();
                return new Promise<never>(() => {});
            }, controller.signal);
            await probeStarted;
            expect(policy.breaker?.state).toBe(CircuitState.HalfOpen);

            controller.abort();

            await expect(probe).rejects.toSatisfy(isTaskCancelledError);
            expect(policy.breaker?.state).toBe(CircuitState.Open);
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
