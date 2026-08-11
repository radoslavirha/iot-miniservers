import type { HealthConfig } from '@radoslavirha/health';
import { Injectable, ProviderScope } from '@tsed/di';
import { HealthCheckService } from '../HealthCheckService.js';

/**
 * Test-only `HealthCheckService` override.
 *
 * Mirrors `TestLoggerProvider` in `@radoslavirha/tsed-logger`. The base class takes its
 * configuration as a constructor parameter, which Ts.ED cannot resolve on its own — a
 * plain config object has no DI token — so an override must supply it. Every consumer does
 * this anyway (`HealthProvider` in each API); the test suite is just another consumer.
 *
 * Call `configure()` in `beforeEach` **before** bootstrapping the platform.
 */
@Injectable({ token: HealthCheckService, scope: ProviderScope.SINGLETON })
export class TestHealthProvider extends HealthCheckService {
    private static options: HealthConfig = {};

    public static configure(config: HealthConfig): void {
        TestHealthProvider.options = config;
    }

    public constructor() {
        super(TestHealthProvider.options);
    }
}
