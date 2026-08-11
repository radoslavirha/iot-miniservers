import { HealthStatus } from './HealthStatus.enum.js';
import type { HealthCheck, HealthCheckResult, HealthReport } from './HealthCheck.js';

/** A check paired with the result of evaluating it. */
export interface EvaluatedCheck {
    readonly check: Pick<HealthCheck, 'name' | 'critical'>;
    readonly result: HealthCheckResult;
}

/**
 * Whether the pod should be in the Service's Endpoints.
 *
 * Only `critical` checks gate readiness. A failing non-critical check — a third-party API
 * whose circuit breaker is open, say — must never remove the pod, or an outage nobody
 * here can fix becomes an outage of this app too.
 */
export const isReady = (evaluated: readonly EvaluatedCheck[]): boolean =>
    evaluated.every(({ check, result }) => !check.critical || result.status !== HealthStatus.Fail);

/**
 * Rolls individual results up into one status.
 *
 * - `fail` — at least one **critical** check failed.
 * - `warn` — something is degraded: any `warn`, or a non-critical `fail`.
 * - `pass` — everything is healthy, including the empty case.
 *
 * Note `fail` is reserved for critical failures, so a non-critical failure surfaces as
 * `warn` and the endpoint still answers 200. That asymmetry is the whole point of
 * {@link HealthCheck.critical}.
 */
export const rollUp = (evaluated: readonly EvaluatedCheck[]): HealthStatus => {
    if (!isReady(evaluated)) {
        return HealthStatus.Fail;
    }

    const degraded = evaluated.some(
        ({ result }) => result.status === HealthStatus.Warn || result.status === HealthStatus.Fail
    );

    return degraded ? HealthStatus.Warn : HealthStatus.Pass;
};

/**
 * Builds the `application/health+json` body.
 *
 * @param includeChecks when `false`, the per-check breakdown is omitted entirely — the
 *   key is absent rather than empty, so nothing leaks the set of dependency names.
 */
export const buildReport = (
    evaluated: readonly EvaluatedCheck[],
    includeChecks = true
): HealthReport => {
    const status = rollUp(evaluated);

    if (!includeChecks) {
        return { status };
    }

    const checks: Record<string, HealthCheckResult> = {};
    for (const { check, result } of evaluated) {
        checks[check.name] = result;
    }

    return { status, checks };
};
