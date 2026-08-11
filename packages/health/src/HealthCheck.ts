import type { HealthStatus } from './HealthStatus.enum.js';

/** Maximum length of a {@link HealthCheckResult.detail}, enforced by the registry. */
export const MAX_DETAIL_LENGTH = 120;

export interface HealthCheckResult {
    readonly status: HealthStatus;
    /**
     * Short, non-sensitive detail — a state name, not a message.
     *
     * Never a URL, a hostname, a credential or a stack trace: `/health` is readable by
     * anything that can reach the pod. Truncated to {@link MAX_DETAIL_LENGTH} characters
     * by the registry.
     */
    readonly detail?: string;
    /** Optional numeric observation, e.g. latency in ms. IETF `observedValue`. */
    readonly observedValue?: number;
}

export interface HealthCheck {
    /** Stable identifier, e.g. `mongodb`, `mqtt`. Appears in the `/health` body. */
    readonly name: string;
    /**
     * Whether a `fail` here removes the pod from the Service's Endpoints.
     *
     * - `true` — the app cannot do its job without this. `/health/ready` returns 503.
     * - `false` — informational. A `fail` degrades the report to `warn`; readiness is
     *   unaffected. Use for anything that cannot be fixed by restarting or rescheduling
     *   this pod — third-party APIs above all. Failing readiness on someone else's
     *   outage converts their incident into yours.
     */
    readonly critical: boolean;
    /**
     * @param signal aborts at the per-check deadline. Honour it — an abandoned check
     *   still holds its connection. Every I/O path in this repository already accepts an
     *   `AbortSignal` (`ResiliencePolicy.execute`, mongoose `QueryOptions.signal`).
     */
    check(signal: AbortSignal): Promise<HealthCheckResult> | HealthCheckResult;
}

/**
 * The aggregated report returned by `/health`.
 *
 * `checks` is omitted entirely when `exposeDetail` is disabled, and by `/health/ready`,
 * which returns the status alone.
 */
export interface HealthReport {
    readonly status: HealthStatus;
    readonly checks?: Readonly<Record<string, HealthCheckResult>>;
}
