import type { HealthReport } from '@radoslavirha/health';
import { Controller, Inject, ProviderScope, Scope } from '@tsed/di';
import type { PlatformContext } from '@tsed/platform-http';
import { Context } from '@tsed/platform-params';
import { Get, Hidden } from '@tsed/schema';
import { HealthCheckService } from './HealthCheckService.js';
import { ShutdownState } from './ShutdownState.js';
import { HealthStatus } from '@radoslavirha/health';

/** IETF `draft-inadarei-api-health-check` media type. */
export const HEALTH_CONTENT_TYPE = 'application/health+json';

/**
 * Kubernetes probe endpoints.
 *
 * Mount explicitly at `/`, alongside `SwaggerController` — every app overrides `mount` in
 * its own `@Configuration`, so anything mounted here by decorator would be dropped. Never
 * mount under a version prefix: the probe path must be identical across apps or the
 * chart's copy-paste probe block stops being copy-paste.
 *
 * ```ts
 * mount: { '/': [SwaggerController, HealthController, ...ObjectUtils.values(rest)] }
 * ```
 */
@Controller('/health')
@Hidden()
@Scope(ProviderScope.SINGLETON)
export class HealthController {
    @Inject(HealthCheckService)
    private readonly health!: HealthCheckService;

    @Inject(ShutdownState)
    private readonly shutdown!: ShutdownState;

    /**
     * Liveness. Answers 200 unconditionally.
     *
     * Reaching this handler *is* the check — the event loop is turning and the HTTP
     * server is answering. It performs no I/O, never consults the registry, and stays 200
     * while draining and while every dependency is down.
     *
     * That is not laziness, it is the single most important decision here. A dependency
     * check in a liveness probe means a Mongo blip restarts every replica of every
     * service simultaneously, they all reconnect at once, and the health check becomes the
     * outage. Dependencies belong in readiness, which only removes the pod from Endpoints.
     */
    @Get('/live')
    public live(@Context() $ctx: PlatformContext): HealthReport {
        $ctx.response.contentType(HEALTH_CONTENT_TYPE);
        return { status: HealthStatus.Pass };
    }

    /**
     * Readiness. 200 when this pod should receive traffic, 503 when it should not.
     *
     * Returns 503 immediately while draining, without evaluating anything. Otherwise only
     * `critical` checks gate the result — see `HealthCheck.critical`.
     *
     * Body is the status alone: kubelet needs nothing more, and `/health` exists for the
     * consumer that wants detail.
     */
    @Get('/ready')
    public async ready(@Context() $ctx: PlatformContext): Promise<HealthReport> {
        $ctx.response.contentType(HEALTH_CONTENT_TYPE);

        if (this.shutdown.draining) {
            $ctx.response.status(503);
            return { status: HealthStatus.Fail };
        }

        const { ready, report } = await this.health.evaluate();

        if (!ready) {
            $ctx.response.status(503);
        }

        return { status: report.status };
    }

    /**
     * Full report, for humans and dashboards. 200 for `pass` and `warn`, 503 for `fail`.
     *
     * `warn` answering 200 is deliberate: a degraded third-party upstream must be visible
     * without being actionable by kubelet.
     */
    @Get('/')
    public async detail(@Context() $ctx: PlatformContext): Promise<HealthReport> {
        $ctx.response.contentType(HEALTH_CONTENT_TYPE);

        if (this.shutdown.draining) {
            $ctx.response.status(503);
            return { status: HealthStatus.Fail };
        }

        const report = await this.health.report();

        if (report.status === HealthStatus.Fail) {
            $ctx.response.status(503);
        }

        return report;
    }
}
