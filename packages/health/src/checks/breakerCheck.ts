import { CircuitState, type CircuitStateLike } from '@radoslavirha/resilience';
import { HealthStatus } from '../HealthStatus.enum.js';
import type { HealthCheck, HealthCheckResult } from '../HealthCheck.js';

interface StateMapping {
    readonly name: string;
    readonly status: HealthStatus;
}

/**
 * How a breaker's state reads as health.
 *
 * Keyed off the real `CircuitState` enum rather than mirrored numeric values: a
 * hand-copied `1: 'open'` would silently misreport every upstream as healthy if cockatiel
 * ever renumbered.
 *
 * `HalfOpen` is `warn`, not `fail` — the breaker is letting a probe request through to
 * test recovery, which is degraded rather than down.
 */
const STATES: Record<CircuitState, StateMapping> = {
    [CircuitState.Closed]: { name: 'closed', status: HealthStatus.Pass },
    [CircuitState.Open]: { name: 'open', status: HealthStatus.Fail },
    [CircuitState.HalfOpen]: { name: 'half-open', status: HealthStatus.Warn },
    [CircuitState.Isolated]: { name: 'isolated', status: HealthStatus.Fail }
};

/**
 * Reports an existing circuit breaker's state as a health check.
 *
 * Passive by design: it reads a field, issues no request, and adds no load to the
 * dependency. A breaker that has seen no traffic reports `pass` — correct, because there
 * is no evidence of a fault. That is the argument for reading a breaker already guarding
 * real traffic instead of probing the dependency directly: the signal comes from actual
 * requests, so it costs nothing and cannot raise a false alarm while idle.
 *
 * Defaults to `critical: false`. A breaker guarding a third-party API must never gate
 * readiness — an outage you cannot fix would otherwise remove your own pods from
 * Endpoints, converting someone else's incident into yours.
 */
export const breakerCheck = (
    name: string,
    breaker: CircuitStateLike,
    opts: { critical?: boolean } = {}
): HealthCheck => ({
    name,
    critical: opts.critical ?? false,
    check: (): HealthCheckResult => {
        const mapping = STATES[breaker.state];

        if (!mapping) {
            return { status: HealthStatus.Warn, detail: 'circuit-unknown' };
        }

        return mapping.status === HealthStatus.Pass
            ? { status: HealthStatus.Pass }
            : { status: mapping.status, detail: `circuit-${mapping.name}` };
    }
});
