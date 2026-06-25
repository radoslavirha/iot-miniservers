import {
    ConstantBackoff,
    SamplingBreaker,
    TimeoutStrategy,
    circuitBreaker,
    handleAll,
    handleWhen,
    noop,
    retry,
    timeout,
    wrap,
    type CircuitBreakerPolicy,
    type IPolicy,
    type Policy,
    type RetryPolicy,
    type TimeoutPolicy
} from 'cockatiel';
import { ResilienceConfig, ResilienceConfigSchema } from './schemas/resilience.schema.js';

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
     * error classification here (e.g. retry only on network errors / 5xx).
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
    const filter: Policy = options.shouldHandle ? handleWhen(options.shouldHandle) : handleAll;
    const hooks = options.hooks;

    let breaker: CircuitBreakerPolicy | undefined;
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

    let retryPolicy: RetryPolicy | undefined;
    if (cfg.retry && cfg.retry.count > 0) {
        retryPolicy = retry(filter, {
            maxAttempts: cfg.retry.count,
            backoff: new ConstantBackoff(cfg.retry.backoffMs)
        });

        if (hooks?.onRetry) {
            retryPolicy.onRetry(({ attempt, delay }) => hooks.onRetry?.({ attempt, delay }));
        }
    }

    let timeoutPolicy: TimeoutPolicy | undefined;
    if (cfg.timeout) {
        timeoutPolicy = timeout(cfg.timeout.ms, TimeoutStrategy.Aggressive);

        if (hooks?.onTimeout) {
            timeoutPolicy.onTimeout(() => hooks.onTimeout?.());
        }
    }

    const ordered: IPolicy[] = [retryPolicy, breaker, timeoutPolicy].filter(
        (policy): policy is RetryPolicy | CircuitBreakerPolicy | TimeoutPolicy => policy !== undefined
    );

    const composed: IPolicy =
        ordered.length === 0
            ? noop
            : ordered.length === 1
                ? ordered[0]
                : wrap(...(ordered as [IPolicy, IPolicy, ...IPolicy[]]));

    return {
        breaker,
        execute<T>(fn: (signal: AbortSignal) => Promise<T>, parentSignal?: AbortSignal): Promise<T> {
            return composed.execute((context) => fn(context.signal), parentSignal);
        }
    };
}
