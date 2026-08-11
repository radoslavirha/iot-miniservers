import { Inject, Injectable, ProviderScope, Scope } from '@tsed/di';
import { MongooseService } from '@tsed/mongoose';
import { HEALTH_CHECKS } from './HEALTH_CHECKS.js';
import type { HealthCheck, HealthCheckResult } from './index.js';
import { HealthStatus } from '@radoslavirha/health';

/**
 * `mongoose.ConnectionStates`, by value.
 *
 * Mirrored rather than imported because mongoose exports it as a value only via the
 * `mongoose` default export, and this module is loaded through an optional peer — the map
 * is used for the `detail` string, so an unrecognised value degrades to `unknown` rather
 * than misreporting.
 */
const READY_STATE_NAMES: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized'
};

/**
 * Reports the MongoDB connection state, for apps that use `@tsed/mongoose`.
 *
 * **Scheduled to move to `@radoslavirha/tsed-mongoose`** — that package already owns
 * mongoose, its peers and its testcontainers setup. This file lives here only because
 * `tsed-mongoose` is in `toolkit-hub` and cannot depend on an unpublished workspace
 * package. See `docs/superpowers/specs/2026-08-11-health-packages-graduation.md`.
 *
 * Imported from the `/mongoose` subpath so `mongoose` and `@tsed/mongoose` stay optional
 * peers — an app with no database never resolves them:
 *
 * ```ts
 * import { MongoHealthCheck } from '@radoslavirha/tsed-health/mongoose';
 * export { MongoHealthCheck };   // re-export from the app's health barrel to register it
 * ```
 *
 * `critical: true` — an app that reaches for a database generally cannot serve without it.
 * Failing readiness only removes the pod from the Service's Endpoints; nothing restarts,
 * because liveness never consults this.
 *
 * Reads `readyState` rather than issuing a `ping`: the field is free, a ping is a network
 * round trip every few seconds for the life of the pod.
 */
@Injectable({ type: HEALTH_CHECKS })
@Scope(ProviderScope.SINGLETON)
export class MongoHealthCheck implements HealthCheck {
    public readonly name = 'mongodb';
    public readonly critical = true;

    @Inject(MongooseService)
    private readonly mongoose!: MongooseService;

    public check(): HealthCheckResult {
        const connection = this.mongoose.get();

        /**
         * No connection registered means Mongo was never configured — `MongooseService`
         * only populates its map from `connect()`, which Ts.ED calls once per configured
         * connection. A bootstrap failure is not this case: the process exits instead.
         *
         * Reporting `fail` here would leave a correctly-configured database-less
         * deployment permanently out of Endpoints — silently, with no restart and no error
         * log, because liveness is shallow by design.
         */
        if (!connection) {
            return { status: HealthStatus.Pass, detail: 'disabled' };
        }

        if (connection.readyState === 1) {
            return { status: HealthStatus.Pass };
        }

        // The state name only. Never the connection or its error — a mongoose connection
        // error's message embeds the connection URI, credentials included.
        return {
            status: HealthStatus.Fail,
            detail: READY_STATE_NAMES[connection.readyState] ?? 'unknown'
        };
    }
}
