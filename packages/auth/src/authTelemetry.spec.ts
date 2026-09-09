import { afterEach, describe, expect, it } from 'vitest';
import { metrics } from '@opentelemetry/api';
import { InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { DataPoint, ResourceMetrics } from '@opentelemetry/sdk-metrics';
import {
    ATTR_AUTH_ISSUER,
    ATTR_AUTH_OUTCOME,
    METRIC_AUTH_VERIFICATIONS,
    recordVerification
} from './authTelemetry.js';
import { VerificationReason } from './VerificationOutcome.js';

/**
 * A real SDK provider, not a mock. The whole hazard this code guards against —
 * instruments binding to the no-op provider — is invisible to a mock, because a
 * mock is what a no-op provider looks like.
 */
const withRealProvider = () => {
    const exporter = new InMemoryMetricExporter(0);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
    return { provider, reader };
};

const pointsFor = (collected: ResourceMetrics, name: string): DataPoint<number>[] =>
    collected.scopeMetrics
        .flatMap(scope => scope.metrics)
        .filter(metric => metric.descriptor.name === name)
        .flatMap(metric => metric.dataPoints as DataPoint<number>[]);

afterEach(() => {
    metrics.disable();
});

describe('recordVerification', () => {
    it('counts an outcome under its reason string, verbatim', async () => {
        const { reader } = withRealProvider();

        recordVerification(VerificationReason.Invalid);

        const points = pointsFor((await reader.collect()).resourceMetrics, METRIC_AUTH_VERIFICATIONS);
        expect(points).toHaveLength(1);
        expect(points[0]?.value).toBe(1);
        expect(points[0]?.attributes[ATTR_AUTH_OUTCOME]).toBe('invalid');
    });

    it('separates outcomes by reason, so a rate of refusals is readable per cause', async () => {
        const { reader } = withRealProvider();

        recordVerification(VerificationReason.Missing);
        recordVerification(VerificationReason.Missing);
        recordVerification(VerificationReason.Ok, 'https://idp.test/');

        const points = pointsFor((await reader.collect()).resourceMetrics, METRIC_AUTH_VERIFICATIONS);
        const missing = points.find(p => p.attributes[ATTR_AUTH_OUTCOME] === 'missing');
        const ok = points.find(p => p.attributes[ATTR_AUTH_OUTCOME] === 'ok');

        expect(missing?.value).toBe(2);
        expect(ok?.value).toBe(1);
    });

    it('labels the issuer only when one matched', async () => {
        const { reader } = withRealProvider();

        recordVerification(VerificationReason.Ok, 'https://idp.test/');
        // No issuer matched, so none is labelled — an attacker sending made-up
        // `iss` claims would otherwise mint unbounded label values.
        recordVerification(VerificationReason.UnknownIssuer);

        const points = pointsFor((await reader.collect()).resourceMetrics, METRIC_AUTH_VERIFICATIONS);
        const ok = points.find(p => p.attributes[ATTR_AUTH_OUTCOME] === 'ok');
        const unknown = points.find(p => p.attributes[ATTR_AUTH_OUTCOME] === 'unknown-issuer');

        expect(ok?.attributes[ATTR_AUTH_ISSUER]).toBe('https://idp.test/');
        expect(unknown?.attributes).not.toHaveProperty(ATTR_AUTH_ISSUER);
    });

    it('binds to a provider registered after the module was imported', async () => {
        // The trap this file's WeakMap exists for: the metrics API has no proxy
        // provider, so an instrument built eagerly would be bound to the no-op
        // provider forever and every metric here would silently vanish.
        recordVerification(VerificationReason.Invalid);

        const { reader } = withRealProvider();
        recordVerification(VerificationReason.Invalid);

        const points = pointsFor((await reader.collect()).resourceMetrics, METRIC_AUTH_VERIFICATIONS);
        expect(points[0]?.value).toBe(1);
    });
});
