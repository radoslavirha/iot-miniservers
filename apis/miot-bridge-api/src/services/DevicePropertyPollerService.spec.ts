import { PlatformTest } from '@tsed/platform-http/testing';
import { metrics, SpanKind, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import {
    MeterProvider,
    MetricReader,
    type DataPoint,
    type Histogram as HistogramValue,
    type MetricData
} from '@opentelemetry/sdk-metrics';
import {
    InMemorySpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
    type ReadableSpan
} from '@opentelemetry/sdk-trace-node';
import { MiotError, MIOT_ERROR_DEVICE_ERROR, MIOT_ERROR_TIMEOUT, MIOT_METHOD_GET_PROPERTIES } from '@radoslavirha/miot-device';
import { METRIC_JOB_RUN_DURATION, METRIC_JOB_RUN_ITEMS, METRIC_JOB_RUN_SKIPS } from '@radoslavirha/otel';
import type { BaseLogger } from '@radoslavirha/tsed-logger';
import { CommonUtils } from '@radoslavirha/utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceNotification } from '../models/notifications/DeviceNotification.js';
import {
    JOB_POLL_DEVICE_PROPERTIES,
    JOB_POLL_SUBSCRIPTIONS_LOAD,
    SPAN_POLL_DEVICE,
    SPAN_POLL_SUBSCRIPTIONS_LOAD,
    SPAN_POLL_TICK
} from '../otel/telemetry.js';
import { ConfigService } from './ConfigService.js';
import { DeviceCommandService, type GetPropertiesResponse } from './DeviceCommandService.js';
import { DevicePropertyPollerService, PROPERTY_CHANGED } from './DevicePropertyPollerService.js';
import { NotificationStorageService } from './NotificationStorageService.js';

const STORAGE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MIOT_DEVICE_ID = 442;
const PROPERTY = 'vacuum:status';

/** Short enough that a handful of ticks pass inside one test, long enough to stay ordered. */
const INTERVAL_MS = 5;

/** Stands in for the mongoose instrumentation: attaches to whatever span is current. */
const DOWNSTREAM_SPAN = 'mongodb.find';

const exporter = new InMemorySpanExporter();

/** Collects on demand, with none of the timers a `PeriodicExportingMetricReader` would start. */
class OnDemandMetricReader extends MetricReader {
    protected onForceFlush(): Promise<void> {
        return Promise.resolve();
    }

    protected onShutdown(): Promise<void> {
        return Promise.resolve();
    }
}

let reader: OnDemandMetricReader;

const spans = (): ReadableSpan[] => exporter.getFinishedSpans();

const collect = async (name: string): Promise<MetricData | undefined> => {
    const { resourceMetrics } = await reader.collect();

    return resourceMetrics.scopeMetrics
        .flatMap((scope) => scope.metrics)
        .find((metric) => metric.descriptor.name === name);
};

/** The data point carrying `attributes`, or `undefined` while the job has not recorded one yet. */
const point = async (name: string, attributes: Attributes): Promise<DataPoint<unknown> | undefined> =>
    (await collect(name))?.dataPoints.find((candidate) =>
        Object.entries(attributes).every(([key, value]) => candidate.attributes[key] === value)
    );

const runs = async (outcome: string, job = JOB_POLL_DEVICE_PROPERTIES): Promise<number> => {
    const match = await point(METRIC_JOB_RUN_DURATION, { 'job.name': job, 'job.run.outcome': outcome });

    return (match?.value as HistogramValue | undefined)?.count ?? 0;
};

const items = async (outcome: string): Promise<number> => {
    const match = await point(METRIC_JOB_RUN_ITEMS, {
        'job.name': JOB_POLL_DEVICE_PROPERTIES,
        'job.item.outcome': outcome
    });

    return (match?.value as number | undefined) ?? 0;
};

const skips = async (reason: string): Promise<number> => {
    const match = await point(METRIC_JOB_RUN_SKIPS, {
        'job.name': JOB_POLL_DEVICE_PROPERTIES,
        'job.skip.reason': reason
    });

    return (match?.value as number | undefined) ?? 0;
};

const spansNamed = (name: string): ReadableSpan[] => spans().filter((span) => span.name === name);

const spanNamed = (name: string): ReadableSpan => {
    const span = spansNamed(name)[0];
    if (span === undefined) {
        throw new Error(`No span named "${name}". Got: ${spans().map((s) => s.name).join(', ')}`);
    }
    return span;
};

const subscription = (): DeviceNotification =>
    CommonUtils.buildModelStrict(DeviceNotification, {
        id: 'notification-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deviceId: STORAGE_ID,
        property: PROPERTY
    });

const reading = (value: string): GetPropertiesResponse => ({
    miotDeviceId: MIOT_DEVICE_ID,
    results: [{ key: PROPERTY, siid: 2, piid: 1, source: 'spec' as const, value, code: 0 }]
});

describe('DevicePropertyPollerService', () => {
    let poller: DevicePropertyPollerService;
    let configService: ConfigService;
    let deviceCommandService: DeviceCommandService;
    let getProperties: ReturnType<typeof vi.spyOn>;

    beforeAll(() => {
        new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();
    });

    afterAll(() => {
        trace.disable();
    });

    beforeEach(async () => {
        exporter.reset();
        // A fresh provider per test rather than a fresh reader: cumulative counters never go back
        // down, so sharing one would leak every previous test's increments into this one.
        reader = new OnDemandMetricReader();
        metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
        await PlatformTest.create();

        configService = PlatformTest.get<ConfigService>(ConfigService);
        poller = PlatformTest.get<DevicePropertyPollerService>(DevicePropertyPollerService);
        deviceCommandService = PlatformTest.get<DeviceCommandService>(DeviceCommandService);

        vi.spyOn(PlatformTest.get<NotificationStorageService>(NotificationStorageService), 'getAll').mockResolvedValue([
            subscription()
        ]);
        getProperties = vi.spyOn(deviceCommandService, 'getProperties').mockResolvedValue(reading('sweeping'));
    });

    afterEach(async () => {
        await poller.$onDestroy();
        PlatformTest.reset();
        vi.restoreAllMocks();
        await reader.shutdown();
        metrics.disable();
    });

    /**
     * Starts the poller with polling switched on.
     *
     * `config/test.json` has no `polling` block, so the container's own `$onInit` was a no-op —
     * which is what makes overriding the config afterwards and starting by hand safe. The
     * listener is cleared first so the second `$onInit` does not double-register it.
     */
    const start = async (polling: Record<string, unknown> = {}): Promise<void> => {
        vi.spyOn(configService, 'config', 'get').mockReturnValue({
            ...configService.config,
            polling: {
                enabled: true,
                intervalMs: INTERVAL_MS,
                dispatchOnChange: true,
                maxErrorCount: 3,
                errorSkipCycles: 20,
                ...polling
            }
        } as typeof configService.config);

        poller.removeAllListeners(PROPERTY_CHANGED);
        await poller.$onInit();
    };

    /** Waits until the device has been read `count` times, i.e. `count` ticks have run. */
    const ticks = (count: number): Promise<void> =>
        vi.waitUntil(() => getProperties.mock.calls.length >= count, { timeout: 2_000 }).then(() => undefined);

    describe('Polling', () => {
        it('Should read the subscribed properties of every device', async () => {
            await start();
            await ticks(1);

            expect(getProperties).toHaveBeenCalledWith(STORAGE_ID, [PROPERTY]);
        });

        it('Should emit a property change event for a new value', async () => {
            const changes: unknown[] = [];

            await start();
            poller.on(PROPERTY_CHANGED, (event) => changes.push(event));
            await vi.waitUntil(() => changes.length > 0);

            expect(changes[0]).toMatchObject({ deviceId: STORAGE_ID, miotDeviceId: MIOT_DEVICE_ID, newValue: 'sweeping' });
        });

        it('Should trace the subscription load at startup', async () => {
            await start();

            expect(spanNamed(SPAN_POLL_SUBSCRIPTIONS_LOAD).attributes).toMatchObject({
                'miot.poll.subscription.count': 1,
                'miot.poll.device.count': 1
            });
        });

        it('Should not start when polling is disabled', async () => {
            await poller.$onInit();
            await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 4));

            expect(getProperties).not.toHaveBeenCalled();
            expect(spans()).toHaveLength(0);
        });
    });

    describe('Tracing', () => {
        it('Should root a trace per tick with a child span per device', async () => {
            await start();
            await ticks(1);
            await vi.waitUntil(() => spansNamed(SPAN_POLL_DEVICE).length > 0);

            const tick = spanNamed(SPAN_POLL_TICK);
            const device = spanNamed(SPAN_POLL_DEVICE);

            expect(tick.kind).toBe(SpanKind.INTERNAL);
            expect(tick.parentSpanContext).toBeUndefined();
            expect(tick.attributes).toMatchObject({
                'miot.poll.device.count': 1,
                'miot.poll.failing.count': 0,
                'miot.poll.interval_ms': INTERVAL_MS
            });
            expect(device.parentSpanContext?.spanId).toBe(tick.spanContext().spanId);
            expect(device.attributes).toMatchObject({
                'miot.device.storage_id': STORAGE_ID,
                'miot.device.id': String(MIOT_DEVICE_ID),
                'miot.property.count': 1
            });
        });

        // The reason the tick span exists at all: before it, each of these attached to nothing
        // and became a parentless single-span trace of its own, thousands a day.
        it('Should make work done during a poll a child of the device span', async () => {
            getProperties.mockImplementation(async () => {
                trace.getTracer('mongoose').startSpan(DOWNSTREAM_SPAN).end();
                return reading('sweeping');
            });

            await start();
            await vi.waitUntil(() => spansNamed(DOWNSTREAM_SPAN).length > 0);

            expect(spanNamed(DOWNSTREAM_SPAN).parentSpanContext?.spanId).toBe(
                spanNamed(SPAN_POLL_DEVICE).spanContext().spanId
            );
        });

        // Sampling: the poller runs forever at a fixed rate, so tracing every tick is what made
        // a Tempo search return nothing but poller traces.
        it('Should trace only one tick per traceIntervalMs', async () => {
            await start({ traceIntervalMs: 60_000 });
            await ticks(4);

            expect(spansNamed(SPAN_POLL_TICK)).toHaveLength(1);
        });

        // And a sampled-out tick must emit *nothing*, not merely skip the wrapper — otherwise
        // its Mongo calls start traces of their own and the flood is back.
        it('Should drop the spans of a sampled-out tick instead of orphaning them', async () => {
            getProperties.mockImplementation(async () => {
                trace.getTracer('mongoose').startSpan(DOWNSTREAM_SPAN).end();
                return reading('sweeping');
            });

            await start({ traceIntervalMs: 60_000 });
            await ticks(4);

            expect(spansNamed(DOWNSTREAM_SPAN)).toHaveLength(1);
            expect(spans().every((span) => span.parentSpanContext !== undefined || span.name === SPAN_POLL_TICK || span.name === SPAN_POLL_SUBSCRIPTIONS_LOAD)).toBe(true);
        });

        // Each tick is its own trace. The timer callback inherits the context that scheduled it,
        // so without `root` the loop would chain every tick onto the first and grow one
        // unbounded trace for the lifetime of the pod.
        it('Should give every tick its own trace when traceIntervalMs is 0', async () => {
            await start({ traceIntervalMs: 0 });
            await ticks(3);
            await vi.waitUntil(() => spansNamed(SPAN_POLL_TICK).length >= 3);

            const ticks3 = spansNamed(SPAN_POLL_TICK);
            const traceIds = new Set(ticks3.map((span) => span.spanContext().traceId));

            expect(ticks3.every((span) => span.parentSpanContext === undefined)).toBe(true);
            expect(traceIds.size).toBe(ticks3.length);
        });
    });

    // Metrics, not traces, are the primary signal for a job this deterministic: they answer "is
    // the poller running, how long does it take, is it working" always-on, with nobody opening
    // Tempo. Traces are the sampled deep dive.
    describe('Job metrics', () => {
        it('Should record the duration and outcome of every tick', async () => {
            await start({ traceIntervalMs: 0 });
            await ticks(2);
            await vi.waitUntil(async () => (await runs('success')) >= 2, { timeout: 2_000 });

            expect(await runs('failure')).toBe(0);
        });

        it('Should record the startup subscription load as its own job', async () => {
            await start();

            expect(await runs('success', JOB_POLL_SUBSCRIPTIONS_LOAD)).toBe(1);
        });

        // THE pairing this design exists for. Traces are head-sampled; metrics are not. A tick
        // that is sampled out of tracing must still land in the histogram, or the sampling rate
        // silently becomes the run rate and every "is my poller alive" panel lies.
        it('Should record a tick that emitted no span at all', async () => {
            await start({ traceIntervalMs: 60_000 });
            await ticks(4);
            await vi.waitUntil(async () => (await runs('success')) >= 4, { timeout: 2_000 });

            // One traced tick out of four, four measured.
            expect(spansNamed(SPAN_POLL_TICK)).toHaveLength(1);
            expect(await runs('success')).toBeGreaterThanOrEqual(4);
        });

        it('Should count each polled device as a successful item', async () => {
            await start({ traceIntervalMs: 0 });
            await ticks(2);
            await vi.waitUntil(async () => (await items('success')) >= 2, { timeout: 2_000 });

            expect(await items('failure')).toBe(0);
        });

        // The reason item outcomes exist at all: the tick catches the device fault itself, so the
        // run reports success. Without this metric a poller whose every device is dead looks
        // perfectly healthy.
        it('Should count a failing device as a failed item while the run still succeeds', async () => {
            getProperties.mockRejectedValue(new Error('device unreachable'));

            await start({ traceIntervalMs: 0 });
            await ticks(1);
            await vi.waitUntil(async () => (await items('failure')) >= 1, { timeout: 2_000 });

            expect(await runs('failure')).toBe(0);
            expect(await runs('success')).toBeGreaterThanOrEqual(1);
        });

        // Once every device is in back-off the duration histogram stops moving entirely. This
        // counter is the only thing separating "idle" from "dead".
        it('Should count a tick with nothing due as a skip rather than a run', async () => {
            getProperties.mockRejectedValue(new Error('device unreachable'));

            await start({ maxErrorCount: 1, errorSkipCycles: 1_000, traceIntervalMs: 0 });
            await ticks(1);
            await vi.waitUntil(async () => (await skips('nothing_due')) >= 2, { timeout: 2_000 });

            expect(spansNamed(SPAN_POLL_TICK)).toHaveLength(1);
            expect(await runs('success')).toBe(1);
        });

        // `_ticking` is unreachable: `scheduleNext` re-arms only in `tick`'s `finally`, after the
        // awaited work, so exactly one timer is ever armed. An `overrun` series here could only
        // ever read zero, so none is emitted.
        it('Should never record an overrun, which this scheduler cannot produce', async () => {
            await start({ traceIntervalMs: 0 });
            await ticks(3);

            expect(await skips('overrun')).toBe(0);
        });

        // Every value of `job.name` is a permanent series on all three instruments, so the set
        // has to stay the bounded one declared in `otel/telemetry.ts`.
        it('Should keep job.name to the two static values and put no device id on a metric', async () => {
            await start({ traceIntervalMs: 0 });
            await ticks(2);
            await vi.waitUntil(async () => (await runs('success')) >= 2, { timeout: 2_000 });

            const attributes = (await collect(METRIC_JOB_RUN_DURATION))?.dataPoints.map((p) => p.attributes) ?? [];

            expect(new Set(attributes.map((a) => a['job.name']))).toEqual(
                new Set([JOB_POLL_DEVICE_PROPERTIES, JOB_POLL_SUBSCRIPTIONS_LOAD])
            );
            expect(attributes.every((a) => Object.keys(a).length === 2)).toBe(true);
        });
    });

    describe('Device failures', () => {
        /**
         * Spies on the poller's own child logger.
         *
         * `logger.child()` returns a separate instance, so spying on the DI `Logger` sees nothing
         * the poller writes.
         */
        const warnSpy = (): ReturnType<typeof vi.spyOn> =>
            vi.spyOn((poller as unknown as { logger: BaseLogger }).logger, 'warn');

        // Loki cannot regex a code out of prose reliably, and this is the line an operator lands on
        // when a device starts misbehaving. The message stays readable; the classification and the
        // code are fields.
        it('Should log a device fault with the outcome and the code as structured fields', async () => {
            const warn = warnSpy();
            getProperties.mockRejectedValue(new MiotError('Device error -9999: Device error', {
                kind: MIOT_ERROR_DEVICE_ERROR,
                method: MIOT_METHOD_GET_PROPERTIES,
                code: -9999
            }));

            await start();
            await vi.waitUntil(() => warn.mock.calls.length > 0);

            expect(warn.mock.calls[0][1]).toMatchObject({
                deviceId: STORAGE_ID,
                errorType: 'device_error',
                statusCode: '-9999',
                consecutiveErrors: 1
            });
        });

        it('Should classify a timeout as timeout with no status code', async () => {
            const warn = warnSpy();
            getProperties.mockRejectedValue(new MiotError('Command timeout', {
                kind: MIOT_ERROR_TIMEOUT,
                method: MIOT_METHOD_GET_PROPERTIES
            }));

            await start();
            await vi.waitUntil(() => warn.mock.calls.length > 0);

            const fields = warn.mock.calls[0][1] as Record<string, unknown>;
            expect(fields['errorType']).toBe('timeout');
            expect(fields['statusCode']).toBeUndefined();
        });

        it('Should mark the device span failed and keep polling', async () => {
            getProperties.mockRejectedValue(new Error('Command timeout: no response from 192.168.1.42:54321'));

            await start();
            await vi.waitUntil(() => spansNamed(SPAN_POLL_DEVICE).length > 0);

            expect(spanNamed(SPAN_POLL_DEVICE).status).toMatchObject({
                code: SpanStatusCode.ERROR,
                message: 'Command timeout: no response from 192.168.1.42:54321'
            });
        });

        // The one case worth spending trace volume on: a device mid-failure defeats the sampling
        // gate, so the timeouts are visible rather than sampled away.
        it('Should trace a tick that polls a failing device even when sampled out', async () => {
            getProperties.mockRejectedValue(new Error('device unreachable'));

            await start({ traceIntervalMs: 60_000 });
            await ticks(3);
            await vi.waitUntil(() => spansNamed(SPAN_POLL_TICK).length >= 2);

            const failing = spansNamed(SPAN_POLL_TICK)[1];

            expect(failing.attributes).toMatchObject({ 'miot.poll.failing.count': 1 });
        });

        it('Should stop polling a device that keeps failing, and open no span for an empty tick', async () => {
            getProperties.mockRejectedValue(new Error('device unreachable'));

            await start({ maxErrorCount: 1, errorSkipCycles: 1_000, traceIntervalMs: 0 });
            await ticks(1);
            await vi.waitUntil(() => spansNamed(SPAN_POLL_TICK).length > 0);

            const ticksAfterBackOff = spansNamed(SPAN_POLL_TICK).length;
            await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 6));

            expect(getProperties).toHaveBeenCalledTimes(1);
            expect(spansNamed(SPAN_POLL_TICK)).toHaveLength(ticksAfterBackOff);
        });
    });
});
