import {
    CircuitState,
    SamplingBreaker,
    TimeoutStrategy,
    circuitBreaker,
    handleWhen,
    noop,
    timeout,
    wrap,
    type CircuitBreakerPolicy,
    type IPolicy,
    type TimeoutPolicy
} from 'cockatiel';
import { TaskCancelledError } from './errors.js';
import { ResilienceConfigSchema, type ResilienceConfig } from './schemas/resilience.schema.js';
import { combineSignals } from './signals.js';

/**
 * Optional lifecycle callbacks. Kept as plain functions (no logger/framework
 * dependency) so the package stays transport-agnostic and easy to relocate.
 */
export interface ResilienceHooks {
    onBreak?: () => void;
    onReset?: () => void;
    onHalfOpen?: () => void;
    onTimeout?: () => void;
    onRetry?: (info: { attempt: number; delay: number }) => void;
}

export interface ResiliencePolicyOptions {
    /**
     * Predicate deciding which errors count as failures for **both** retry and
     * the circuit breaker. Defaults to handling every error. This is the seam
     * that keeps the package transport-agnostic — inject HTTP/Mongo-specific
    * error classification here (e.g. retry only on network errors / 5xx). It
    * still controls breaker accounting when retry is disabled.
     */
    shouldHandle?: (error: unknown) => boolean;
    hooks?: ResilienceHooks;
}

/**
 * A composed resilience policy. `execute` threads an {@link AbortSignal} into
 * the wrapped work; the signal aborts on timeout (or when `parentSignal`
 * aborts), giving real cancellation to any signal-aware transport.
 */
export interface ResiliencePolicy {
    execute<T>(fn: (signal: AbortSignal) => Promise<T>, parentSignal?: AbortSignal): Promise<T>;
    /** The underlying circuit breaker, when configured (for state inspection). */
    readonly breaker?: CircuitBreakerPolicy;
}

class ParentCancellationError extends TaskCancelledError {}

const isParentCancellationError = (error: unknown): error is ParentCancellationError =>
    error instanceof ParentCancellationError;

const executeWithParentCancellation = <T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutSignal: AbortSignal | undefined,
    parentSignal: AbortSignal | undefined
): Promise<T> => {
    const signal = combineSignals(timeoutSignal, parentSignal) ?? new AbortController().signal;

    if (!parentSignal) {
        return Promise.resolve().then(() => fn(signal));
    }

    return new Promise<T>((resolve, reject) => {
        const cancellationError = new ParentCancellationError();
        const cleanup = (): void => {
            parentSignal.removeEventListener('abort', onParentAbort);
            timeoutSignal?.removeEventListener('abort', onTimeoutAbort);
        };
        const onParentAbort = (): void => {
            cleanup();
            reject(cancellationError);
        };
        const onTimeoutAbort = (): void => {
            cleanup();
        };

        parentSignal.addEventListener('abort', onParentAbort, { once: true });
        timeoutSignal?.addEventListener('abort', onTimeoutAbort, { once: true });
        if (parentSignal.aborted) {
            onParentAbort();
            return;
        }

        queueMicrotask(async () => {
            if (parentSignal.aborted) {
                cleanup();
                reject(cancellationError);
                return;
            }

            try {
                const result = await fn(signal);
                cleanup();
                resolve(result);
            } catch (error) {
                cleanup();
                reject(parentSignal.aborted ? cancellationError : error);
            }
        });
    });
};

const waitForRetryBackoff = (delayMs: number, parentSignal?: AbortSignal): Promise<void> => {
    if (parentSignal?.aborted) {
        return Promise.reject(new ParentCancellationError());
    }

    return new Promise<void>((resolve, reject) => {
        const onAbort = (): void => {
            clearTimeout(timer);
            parentSignal?.removeEventListener('abort', onAbort);
            reject(new ParentCancellationError());
        };
        const timer = setTimeout(() => {
            parentSignal?.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);

        parentSignal?.addEventListener('abort', onAbort, { once: true });
        if (parentSignal?.aborted) {
            onAbort();
        }
    });
};

/**
 * Builds a resilience policy from declarative config, composing the configured
 * sections as **retry → circuit breaker → timeout** (timeout/abort innermost).
 * Omitted sections are skipped; with no config the returned policy simply runs
 * the work with a fresh (non-aborting) signal.
 *
 * @example
 * ```ts
 * const policy = createResiliencePolicy(
 *   { timeout: { ms: 2000 }, circuitBreaker: {} },
 *   { shouldHandle: (e) => isTransient(e) }
 * );
 * const data = await policy.execute((signal) => fetch(url, { signal }));
 * ```
 */
export function createResiliencePolicy(
    config: ResilienceConfig = {},
    options: ResiliencePolicyOptions = {}
): ResiliencePolicy {
    // Parse to apply defaults — callers may pass partial sections (e.g. `{}`).
    const cfg = ResilienceConfigSchema.parse(config);
    const shouldHandle = (error: unknown): boolean => options.shouldHandle?.(error) ?? true;
    const hooks = options.hooks;

    let breaker: CircuitBreakerPolicy | undefined;
    const filter = handleWhen((error: unknown): boolean => {
        if (isParentCancellationError(error)) {
            // Cockatiel treats excluded half-open errors as success; cancellation cannot prove recovery.
            return breaker?.state === CircuitState.HalfOpen;
        }
        return shouldHandle(error);
    });
    if (cfg.circuitBreaker) {
        const cb = cfg.circuitBreaker;
        breaker = circuitBreaker(filter, {
            halfOpenAfter: cb.halfOpenAfterMs,
            breaker: new SamplingBreaker({
                threshold: cb.threshold,
                duration: cb.samplingDurationMs,
                minimumRps: cb.minimumThroughput
            })
        });

        if (hooks?.onBreak) {
            breaker.onBreak(() => hooks.onBreak?.());
        }
        if (hooks?.onReset) {
            breaker.onReset(() => hooks.onReset?.());
        }
        if (hooks?.onHalfOpen) {
            breaker.onHalfOpen(() => hooks.onHalfOpen?.());
        }
    }

    let timeoutPolicy: TimeoutPolicy | undefined;
    if (cfg.timeout) {
        timeoutPolicy = timeout(cfg.timeout.ms, {
            strategy: TimeoutStrategy.Aggressive,
            abortOnReturn: false
        });

        if (hooks?.onTimeout) {
            timeoutPolicy.onTimeout(() => hooks.onTimeout?.());
        }
    }

    const ordered: IPolicy[] = [breaker, timeoutPolicy].filter(
        (policy): policy is CircuitBreakerPolicy | TimeoutPolicy => policy !== undefined
    );

    const attemptPolicy: IPolicy =
        ordered.length === 0
            ? noop
            : ordered.length === 1
                ? ordered[0]
                : wrap(...(ordered as [IPolicy, IPolicy, ...IPolicy[]]));

    return {
        breaker,
        async execute<T>(fn: (signal: AbortSignal) => Promise<T>, parentSignal?: AbortSignal): Promise<T> {
            const maxRetries = cfg.retry?.count ?? 0;
            const backoffMs = cfg.retry?.backoffMs ?? 0;

            for (let attempt = 0;; attempt++) {
                if (parentSignal?.aborted) {
                    throw new ParentCancellationError();
                }

                try {
                    return await attemptPolicy.execute((context) =>
                        executeWithParentCancellation(fn, context.signal, parentSignal)
                    );
                } catch (error) {
                    if (isParentCancellationError(error) || parentSignal?.aborted) {
                        throw new ParentCancellationError();
                    }

                    if (attempt >= maxRetries || !shouldHandle(error)) {
                        throw error;
                    }

                    const retryAttempt = attempt + 1;
                    hooks?.onRetry?.({ attempt: retryAttempt, delay: backoffMs });
                    await waitForRetryBackoff(backoffMs, parentSignal);
                }
            }
        }
    };
}
