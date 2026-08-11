import { z } from 'zod';

/**
 * Health endpoint configuration. Every field is defaulted, so `{}` — or an absent
 * `health` key in an app's config — is valid and yields the recommended behaviour.
 */
export const HealthConfigSchema = z.object({
    /**
     * Per-check hard deadline. A check that exceeds it yields `fail` with
     * `detail: 'timeout'` rather than stalling the probe.
     *
     * Keep below `readinessProbe.timeoutSeconds`, so a slow dependency reports a body
     * kubelet can log instead of being cut off as a bodyless probe timeout.
     */
    checkTimeoutMs: z.number().int().min(1).default(2000),
    /**
     * Result reuse window. Concurrent and closely-spaced evaluations share one result.
     *
     * Keep below the shortest probe `periodSeconds`: staleness is bounded by one probe
     * period, which is below the resolution any probe can act on. `0` disables reuse.
     */
    cacheTtlMs: z.number().int().min(0).default(1000),
    /**
     * When `false`, `GET /health` returns the status alone with no per-check breakdown.
     * For deployments where `/health` ends up routable from outside the cluster.
     */
    exposeDetail: z.boolean().default(true)
}).describe('Health endpoint configuration.');

/**
 * Public config shape. Uses the schema's **input** type so callers may omit any
 * defaulted field — matching `ResilienceConfigSchema`'s convention.
 */
export type HealthConfig = z.input<typeof HealthConfigSchema>;

/** Parsed config, with every default applied. */
export type ResolvedHealthConfig = z.output<typeof HealthConfigSchema>;
