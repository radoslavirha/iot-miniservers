import { HealthCheckService } from '@radoslavirha/tsed-health';
import { CircuitState, HttpProviderService } from '@radoslavirha/tsed-http-provider';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpstreamHealthCheck } from './UpstreamHealthCheck.js';
import { ExternalApi } from '../models/ExternalApi.enum.js';
import { Server } from '../../Server.js';

describe('Health endpoints (integration)', () => {
    let request: SuperTest.Agent;
    let http: HttpProviderService<ExternalApi>;

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
        http = PlatformTest.get<HttpProviderService<ExternalApi>>(HttpProviderService);
    });
    afterEach(PlatformTest.reset);
    afterEach(vi.restoreAllMocks);

    /** Pretends the named upstreams' breakers are in the given cockatiel state. */
    const withBreakers = (states: Partial<Record<ExternalApi, CircuitState>>): void => {
        vi.spyOn(http, 'breakers').mockReturnValue(
            new Map(Object.entries(states).map(([api, state]) => [api as ExternalApi, { state: state as CircuitState }]))
        );
    };

    describe('Registration', () => {
        it('Should register exactly the expected checks', () => {
            const names = PlatformTest.get<HealthCheckService>(HealthCheckService)
                .checks()
                .map((check) => check.name);

            expect(names).toEqual(['upstream-apis']);
        });

        /**
         * This service's only dependencies are third-party HTTP APIs. A critical check
         * here would delete our own pods from Endpoints during an outage we cannot fix.
         * Asserted explicitly so nobody "fixes" it later.
         */
        it('Should register no critical check', () => {
            const checks = PlatformTest.get<HealthCheckService>(HealthCheckService).checks();

            expect(checks.every((check) => !check.critical)).toBe(true);
        });
    });

    describe('Mounting', () => {
        // Controllers here live under /v1; health must not follow, or the chart's probe
        // block stops being identical across apps.
        it('Should serve health at the root, not under /v1', async () => {
            expect.assertions(2);

            const root = await request.get('/health/live').expect(200);
            const versioned = await request.get('/v1/health/live').expect(404);

            expect(root.body).toEqual({ status: 'pass' });
            expect(versioned.body.name).toBe('NOT_FOUND');
        });
    });

    describe('Upstream outage', () => {
        it('Should stay 200 on /health/ready when every upstream breaker is open', async () => {
            expect.assertions(2);
            // CircuitState.Open — both third-party APIs are effectively down.
            withBreakers({ [ExternalApi.ChmiPortal]: CircuitState.Open, [ExternalApi.ChmiOpendata]: CircuitState.Open });

            const ready = await request.get('/health/ready').expect(200);
            const detail = await request.get('/health').expect(200);

            // Degraded and visible, but never actionable by kubelet.
            expect(ready.body).toEqual({ status: 'warn' });
            expect(detail.body.checks['upstream-apis']).toEqual({
                status: 'warn',
                detail: 'degraded: CHMI_OPENDATA, CHMI_PORTAL'
            });
        });

        it('Should stay 200 on /health/live when every upstream breaker is open', async () => {
            expect.assertions(1);
            withBreakers({ [ExternalApi.ChmiPortal]: CircuitState.Open, [ExternalApi.ChmiOpendata]: CircuitState.Open });

            const response = await request.get('/health/live').expect(200);

            expect(response.body).toEqual({ status: 'pass' });
        });

        it('Should name only the degraded upstream', async () => {
            expect.assertions(1);
            withBreakers({ [ExternalApi.ChmiPortal]: CircuitState.Closed, [ExternalApi.ChmiOpendata]: CircuitState.Open });

            const response = await request.get('/health').expect(200);

            expect(response.body.checks['upstream-apis']).toEqual({
                status: 'warn',
                detail: 'degraded: CHMI_OPENDATA'
            });
        });

        // Half-open is recovering, not down — still degraded, still 200.
        it('Should warn while a breaker is half-open', async () => {
            expect.assertions(1);
            withBreakers({ [ExternalApi.ChmiPortal]: CircuitState.HalfOpen });

            const response = await request.get('/health').expect(200);

            expect(response.body.checks['upstream-apis'].status).toBe('warn');
        });
    });

    describe('Healthy and unknown states', () => {
        it('Should pass when every breaker is closed', async () => {
            expect.assertions(1);
            withBreakers({ [ExternalApi.ChmiPortal]: CircuitState.Closed, [ExternalApi.ChmiOpendata]: CircuitState.Closed });

            const response = await request.get('/health').expect(200);

            expect(response.body).toEqual({
                status: 'pass',
                checks: { 'upstream-apis': { status: 'pass' } }
            });
        });

        /**
         * Clients are built lazily and an upstream may have no breaker configured at all.
         * No breaker means no evidence of a fault, which is `pass` — not a failure.
         */
        it('Should pass when no breaker exists yet', async () => {
            expect.assertions(1);
            withBreakers({});

            const response = await request.get('/health').expect(200);

            expect(response.body.checks['upstream-apis']).toEqual({ status: 'pass' });
        });
    });

    describe('UpstreamHealthCheck', () => {
        it('Should be non-critical', () => {
            expect(PlatformTest.get<UpstreamHealthCheck>(UpstreamHealthCheck).critical).toBe(false);
        });
    });
});
