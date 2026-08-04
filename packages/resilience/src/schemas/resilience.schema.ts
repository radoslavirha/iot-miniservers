import { z } from 'zod';

/**
 * Maximum time a single `execute()` is allowed to run before the operation is
 * aborted (via AbortSignal) and the call rejects.
 */
export const TimeoutConfigSchema = z.object({
    ms: z.number().int().min(0).default(5000)
});

/**
 * Retry policy. `count` is the number of *additional* attempts after the first
 * (0 disables retry). `backoffMs` is the constant delay between attempts.
 */
export const RetryConfigSchema = z.object({
    count: z.number().int().min(0).default(0),
    backoffMs: z.number().int().min(0).default(250)
});

/**
 * Circuit breaker policy. Uses a sampling breaker: the circuit opens when the
 * error ratio exceeds `threshold` over the trailing `samplingDurationMs`
 * window, provided there were at least `minimumThroughput` calls per second.
 */
export const CircuitBreakerConfigSchema = z.object({
    halfOpenAfterMs: z.number().int().min(0).default(10000),
    threshold: z.number().gt(0).lt(1).default(0.5),
    samplingDurationMs: z.number().int().min(1).default(10000),
    minimumThroughput: z.number().int().min(1).default(5)
});

/**
 * Full resilience configuration. Every section is optional — omit a section to
 * disable that policy. Composed as retry → circuit breaker → timeout.
 */
export const ResilienceConfigSchema = z.object({
    timeout: TimeoutConfigSchema.optional(),
    retry: RetryConfigSchema.optional(),
    circuitBreaker: CircuitBreakerConfigSchema.optional()
});

export type TimeoutConfig = z.infer<typeof TimeoutConfigSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

/**
 * Public config shape. Uses the schema's **input** type so callers may omit
 * defaulted fields — e.g. `{ circuitBreaker: {} }` to enable the breaker with
 * all defaults. `createResiliencePolicy` parses this to apply defaults.
 */
export type ResilienceConfig = z.input<typeof ResilienceConfigSchema>;
