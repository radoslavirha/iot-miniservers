import { HealthRegistry, type HealthCheck, type HealthConfig, type HealthReport } from '@radoslavirha/health';
import { Injectable, ProviderScope, Scope, injectMany } from '@tsed/di';
import { HEALTH_CHECKS } from './HEALTH_CHECKS.js';

/**
 * Resolves every provider registered under {@link HEALTH_CHECKS} and evaluates them
 * through a {@link HealthRegistry}.
 *
 * Configuration comes in through the constructor, matching `Logger` and
 * `HttpProviderService`. An app supplies it by overriding the token, the same way it
 * already overrides those:
 *
 * ```ts
 * @Injectable({ token: HealthCheckService, scope: ProviderScope.SINGLETON })
 * export class HealthProvider extends HealthCheckService {
 *   public constructor(configService: ConfigService) {
 *     super(configService.config.health);
 *   }
 * }
 * ```
 *
 * **The override is mandatory, not optional.** Ts.ED reads `design:paramtypes` and cannot
 * resolve a plain config object — it has no DI token — so resolving this class without an
 * override fails with "Given token is undefined". That is the same contract `Logger` and
 * `HttpProviderService` carry; every consumer of those overrides them too, and the test
 * suites here and in `toolkit-hub` register `TestHealthProvider` / `TestLoggerProvider`
 * for exactly this reason.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class HealthCheckService {
    private registry?: HealthRegistry;

    public constructor(protected readonly config: HealthConfig = {}) {}

    /**
     * Evaluates every check once, returning both the readiness verdict and the report.
     *
     * Returned together deliberately: `/health/ready` needs both, and the registry's
     * cache would mask a double evaluation rather than prevent it.
     */
    public async evaluate(): Promise<{ ready: boolean; report: HealthReport }> {
        const registry = this.get();
        const { ready } = await registry.evaluate();

        return { ready, report: await registry.report() };
    }

    /** Full `application/health+json` report. */
    public report(): Promise<HealthReport> {
        return this.get().report();
    }

    /** The registered checks, in registration order. Exposed for assertions and logging. */
    public checks(): readonly HealthCheck[] {
        return injectMany<HealthCheck>(HEALTH_CHECKS);
    }

    /**
     * Built lazily: providers register as their modules are imported, so the container is
     * not necessarily complete when this service is constructed.
     */
    private get(): HealthRegistry {
        this.registry ??= new HealthRegistry(this.checks(), this.config);
        return this.registry;
    }
}
