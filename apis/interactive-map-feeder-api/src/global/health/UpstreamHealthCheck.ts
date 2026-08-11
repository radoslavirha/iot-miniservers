import {
    HEALTH_CHECKS,
    breakerCheck,
    type HealthCheck,
    type HealthCheckResult
} from '@radoslavirha/tsed-health';
import { HttpProviderService } from '@radoslavirha/tsed-http-provider';
import { Inject, Injectable, ProviderScope, Scope } from '@tsed/di';
import { ExternalApi } from '../models/ExternalApi.enum.js';
import { HealthStatus } from '@radoslavirha/tsed-health';

/**
 * Reports the circuit-breaker state of the upstream HTTP APIs.
 *
 * **`critical: false`, and it must stay that way.** Every dependency of this service is a
 * third-party HTTP API. Failing readiness on their behalf would remove this pod from the
 * Service's Endpoints during an outage nobody here can fix — converting someone else's
 * incident into an outage of ours, for no benefit. The upstream comes back on its own
 * schedule either way; meanwhile every other route in this app still works.
 *
 * So the state is reported, not enforced: `/health` degrades to `warn` and `/health/ready`
 * keeps answering 200. Alert on the `warn`, do not act on it in the cluster.
 *
 * The signal is **passive** — it reads the breaker that already guards real traffic. No
 * synthetic request is issued, so this adds no load to a service that may already be
 * struggling, and an idle upstream reports `pass` rather than raising a false alarm.
 * A key with no breaker yet (client not built, or no `circuitBreaker` configured) means
 * "no evidence", which is also `pass`.
 */
@Injectable({ type: HEALTH_CHECKS })
@Scope(ProviderScope.SINGLETON)
export class UpstreamHealthCheck implements HealthCheck {
    public readonly name = 'upstream-apis';
    public readonly critical = false;

    @Inject(HttpProviderService)
    private readonly http!: HttpProviderService<ExternalApi>;

    public check(signal: AbortSignal): HealthCheckResult {
        const breakers = this.http.breakers();
        const degraded: string[] = [];

        for (const api of Object.values(ExternalApi)) {
            const breaker = breakers.get(api);

            if (!breaker) {
                continue;
            }

            const { status } = breakerCheck(api, breaker).check(signal) as HealthCheckResult;

            if (status !== HealthStatus.Pass) {
                degraded.push(api);
            }
        }

        if (degraded.length === 0) {
            return { status: HealthStatus.Pass };
        }

        // `warn`, never `fail` — see the note on criticality above. The names are the
        // configured API keys, which are already public in this service's own config.
        return { status: HealthStatus.Warn, detail: `degraded: ${degraded.sort().join(', ')}` };
    }
}
