import { context, metrics, propagation, trace, type Attributes } from '@opentelemetry/api';
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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    JOB_RUN_DURATION_BUCKETS,
    JOB_SKIP_REASON_VALUE_NOTHING_DUE,
    JOB_SKIP_REASON_VALUE_OVERRUN,
    METRIC_JOB_RUN_DURATION,
    METRIC_JOB_RUN_ITEMS,
    METRIC_JOB_RUN_SKIPS,
    recordJobSkip,
    runJob
} from './jobTelemetry.js';

const TRACER = 'test';
const JOB = 'poll_devices';

/** Collects on demand, with none of the timers a `PeriodicExportingMetricReader` would start. */
class OnDemandMetricReader extends MetricReader {
    protected onForceFlush(): Promise<void> {
        return Promise.resolve();
    }

    protected onShutdown(): Promise<void> {
        return Promise.resolve();
    }
}

const spanExporter = new InMemorySpanExporter();

let reader: OnDemandMetricReader;

const spans = (): ReadableSpan[] => spanExporter.getFinishedSpans();

const collect = async (name: string): Promise<MetricData | undefined> => {
    const { resourceMetrics } = await reader.collect();

    return resourceMetrics.scopeMetrics
        .flatMap((scope) => scope.metrics)
        .find((metric) => metric.descriptor.name === name);
};

const metricNamed = async (name: string): Promise<MetricData> => {
    const metric = await collect(name);
    if (metric === undefined) {
        throw new Error(`No metric named "${name}".`);
    }
    return metric;
};

/** The single data point carrying `attributes`, or a readable failure listing what was recorded. */
const pointWith = async (name: string, attributes: Attributes): Promise<DataPoint<unknown>> => {
    const { dataPoints } = await metricNamed(name);
    const match = dataPoints.find((point) =>
        Object.entries(attributes).every(([key, value]) => point.attributes[key] === value)
    );

    if (match === undefined) {
        throw new Error(
            `No "${name}" point with ${JSON.stringify(attributes)}. Got: ${JSON.stringify(
                dataPoints.map((point) => point.attributes)
            )}`
        );
    }

    return match;
};

const histogramWith = async (name: string, attributes: Attributes): Promise<HistogramValue> =>
    (await pointWith(name, attributes)).value as HistogramValue;

const counterWith = async (name: string, attributes: Attributes): Promise<number> =>
    (await pointWith(name, attributes)).value as number;

/** Stands in for an auto-instrumentation: knows nothing, attaches to whatever is current. */
const raiseDownstreamSpan = (): void => trace.getTracer('downstream').startSpan('downstream').end();

describe('jobTelemetry', () => {
    // Both signals come off the *global* providers exactly as they do in an app, so these
    // assertions cover the real wiring — including the SDK's suppression check, which is what
    // makes a sampled-out run drop its subtree without touching its metrics.
    beforeAll(() => {
        new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spanExporter)] }).register();
    });

    afterAll(() => {
        trace.disable();
        propagation.disable();
        context.disable();
    });

    // A fresh provider per test rather than a fresh reader: cumulative counters never go back
    // down, so sharing one provider would leak every previous test's increments into this one.
    beforeEach(() => {
        spanExporter.reset();
        reader = new OnDemandMetricReader();
        metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
    });

    afterEach(async () => {
        await reader.shutdown();
        metrics.disable();
    });

    describe('runJob', () => {
        it('Should record the run duration in seconds against the job name and a success outcome', async () => {
            runJob({ name: JOB, tracer: TRACER }, () => undefined);

            const histogram = await histogramWith(METRIC_JOB_RUN_DURATION, {
                'job.name': JOB,
                'job.run.outcome': 'success'
            });

            expect(histogram.count).toBe(1);
            // Seconds, per semconv — a millisecond value would land above 1 for any real run.
            expect(histogram.sum).toBeLessThan(1);
        });

        it('Should describe the duration as seconds rather than putting the unit in the name', async () => {
            runJob({ name: JOB, tracer: TRACER }, () => undefined);

            expect((await metricNamed(METRIC_JOB_RUN_DURATION)).descriptor.unit).toBe('s');
        });

        // The SDK default boundaries are built for milliseconds and top out at 10000; against
        // sub-second jobs every quantile would read 0.
        it('Should bucket the duration with the job boundaries, not the SDK defaults', async () => {
            runJob({ name: JOB, tracer: TRACER }, () => undefined);

            const histogram = await histogramWith(METRIC_JOB_RUN_DURATION, { 'job.name': JOB });

            expect(histogram.buckets.boundaries).toEqual([...JOB_RUN_DURATION_BUCKETS]);
        });

        it('Should time an async body to its settlement', async () => {
            await runJob({ name: JOB, tracer: TRACER }, async () => {
                await new Promise((resolve) => setTimeout(resolve, 60));
            });

            const histogram = await histogramWith(METRIC_JOB_RUN_DURATION, { 'job.name': JOB });

            expect(histogram.count).toBe(1);
            expect(histogram.sum).toBeGreaterThanOrEqual(0.05);
        });

        it('Should record a failure outcome and rethrow', async () => {
            await expect(runJob({ name: JOB, tracer: TRACER }, () => Promise.reject(new Error('boom')))).rejects.toThrow(
                'boom'
            );

            const histogram = await histogramWith(METRIC_JOB_RUN_DURATION, {
                'job.name': JOB,
                'job.run.outcome': 'failure'
            });

            expect(histogram.count).toBe(1);
        });

        it('Should record a failure outcome for a synchronous throw', async () => {
            expect(() =>
                runJob({ name: JOB, tracer: TRACER }, () => {
                    throw new Error('bad state');
                })
            ).toThrow('bad state');

            expect((await histogramWith(METRIC_JOB_RUN_DURATION, { 'job.run.outcome': 'failure' })).count).toBe(1);
        });

        it('Should return the callback result', () => {
            expect(runJob({ name: JOB, tracer: TRACER }, () => 'polled')).toBe('polled');
        });

        it('Should root a span named after the job', () => {
            runJob({ name: JOB, tracer: TRACER }, () => raiseDownstreamSpan());

            const run = spans().find((span) => span.name === JOB);

            expect(run?.parentSpanContext).toBeUndefined();
            expect(spans().find((span) => span.name === 'downstream')?.parentSpanContext?.spanId).toBe(
                run?.spanContext().spanId
            );
        });

        it('Should let the span be named separately from the job', () => {
            runJob({ name: JOB, tracer: TRACER, spanName: 'poll device properties', attributes: { a: 1 } }, () => undefined);

            expect(spans().map((span) => span.name)).toContain('poll device properties');
        });

        // Span attributes are deliberately not copied onto the metric: they carry device ids and
        // counts, and every distinct value would multiply the series count of all three instruments.
        it('Should keep span attributes off the metric', async () => {
            runJob({ name: JOB, tracer: TRACER, attributes: { 'miot.device.storage_id': 'abc' } }, () => undefined);

            const { dataPoints } = await metricNamed(METRIC_JOB_RUN_DURATION);

            expect(Object.keys(dataPoints[0]!.attributes)).toEqual(['job.name', 'job.run.outcome']);
        });
    });

    // The whole reason both signals live in one helper. Traces are sampled; metrics are not.
    describe('runJob with suppressTrace', () => {
        it('Should record the duration of a run that emits no span at all', async () => {
            runJob({ name: JOB, tracer: TRACER, suppressTrace: true }, () => undefined);

            expect(spans()).toHaveLength(0);
            expect((await histogramWith(METRIC_JOB_RUN_DURATION, { 'job.name': JOB, 'job.run.outcome': 'success' })).count).toBe(1);
        });

        it('Should record the outcome of a sampled-out run that fails', async () => {
            await expect(
                runJob({ name: JOB, tracer: TRACER, suppressTrace: true }, () => Promise.reject(new Error('boom')))
            ).rejects.toThrow('boom');

            expect(spans()).toHaveLength(0);
            expect((await histogramWith(METRIC_JOB_RUN_DURATION, { 'job.run.outcome': 'failure' })).count).toBe(1);
        });

        it('Should record items of a sampled-out run', async () => {
            runJob({ name: JOB, tracer: TRACER, suppressTrace: true }, ({ recordItem }) => recordItem('failure', 3));

            expect(spans()).toHaveLength(0);
            expect(await counterWith(METRIC_JOB_RUN_ITEMS, { 'job.item.outcome': 'failure' })).toBe(3);
        });

        // Suppression drops the subtree rather than orphaning it — and stops at the tracer.
        it('Should drop spans raised underneath while still recording the run', async () => {
            runJob({ name: JOB, tracer: TRACER, suppressTrace: true }, () => raiseDownstreamSpan());

            expect(spans()).toHaveLength(0);
            expect((await histogramWith(METRIC_JOB_RUN_DURATION, { 'job.name': JOB })).count).toBe(1);
        });

        // Sampled and sampled-out runs must land in the same series, or the histogram measures
        // the sampling rate instead of the job.
        it('Should record sampled and sampled-out runs into one series', async () => {
            runJob({ name: JOB, tracer: TRACER }, () => undefined);
            runJob({ name: JOB, tracer: TRACER, suppressTrace: true }, () => undefined);
            runJob({ name: JOB, tracer: TRACER, suppressTrace: true }, () => undefined);

            expect(spans()).toHaveLength(1);
            expect((await metricNamed(METRIC_JOB_RUN_DURATION)).dataPoints).toHaveLength(1);
            expect((await histogramWith(METRIC_JOB_RUN_DURATION, { 'job.name': JOB })).count).toBe(3);
        });
    });

    describe('recordItem', () => {
        it('Should count one item per call by default', async () => {
            runJob({ name: JOB, tracer: TRACER }, ({ recordItem }) => {
                recordItem('success');
                recordItem('success');
                recordItem('failure');
            });

            expect(await counterWith(METRIC_JOB_RUN_ITEMS, { 'job.name': JOB, 'job.item.outcome': 'success' })).toBe(2);
            expect(await counterWith(METRIC_JOB_RUN_ITEMS, { 'job.name': JOB, 'job.item.outcome': 'failure' })).toBe(1);
        });

        it('Should count a batch when given an explicit count', async () => {
            runJob({ name: JOB, tracer: TRACER }, ({ recordItem }) => recordItem('success', 12));

            expect(await counterWith(METRIC_JOB_RUN_ITEMS, { 'job.item.outcome': 'success' })).toBe(12);
        });

        it('Should annotate items as a countable non-unit', async () => {
            runJob({ name: JOB, tracer: TRACER }, ({ recordItem }) => recordItem('success'));

            expect((await metricNamed(METRIC_JOB_RUN_ITEMS)).descriptor.unit).toBe('{item}');
        });

        it('Should hand the body the run span', () => {
            runJob({ name: JOB, tracer: TRACER }, ({ span }) => span.setAttribute('miot.poll.device.count', 4));

            expect(spans().find((span) => span.name === JOB)?.attributes).toMatchObject({
                'miot.poll.device.count': 4
            });
        });
    });

    describe('recordJobSkip', () => {
        it('Should count a run skipped because there was nothing to do', async () => {
            recordJobSkip({ name: JOB, reason: JOB_SKIP_REASON_VALUE_NOTHING_DUE });
            recordJobSkip({ name: JOB, reason: JOB_SKIP_REASON_VALUE_NOTHING_DUE });

            expect(await counterWith(METRIC_JOB_RUN_SKIPS, { 'job.name': JOB, 'job.skip.reason': 'nothing_due' })).toBe(2);
        });

        // Reachable only for a fixed-rate job; nothing in this repo emits it yet. The vocabulary
        // is defined so the first one that can overrun uses this name rather than a new one.
        it('Should count a run skipped because the previous one was still going', async () => {
            recordJobSkip({ name: JOB, reason: JOB_SKIP_REASON_VALUE_OVERRUN });

            expect(await counterWith(METRIC_JOB_RUN_SKIPS, { 'job.skip.reason': 'overrun' })).toBe(1);
        });

        // No span and no log: a skip that repeats every tick would be the loudest thing in Tempo
        // and in Loki while saying nothing the counter does not.
        it('Should emit no span', () => {
            recordJobSkip({ name: JOB, reason: JOB_SKIP_REASON_VALUE_NOTHING_DUE });

            expect(spans()).toHaveLength(0);
        });

        it('Should record no duration, since a skipped run has none', async () => {
            recordJobSkip({ name: JOB, reason: JOB_SKIP_REASON_VALUE_NOTHING_DUE });

            expect(await collect(METRIC_JOB_RUN_DURATION)).toBeUndefined();
        });
    });
});

// A no-op meter provider is what every local `pnpm start` gets: `--import instrument.js` is only
// wired into `start:prod`. The metrics API has no proxy provider, so this is also what a job would
// see forever if the instruments were built at module load instead of on first use.
describe('jobTelemetry without an SDK', () => {
    it('Should run the job and return its value', () => {
        expect(runJob({ name: JOB, tracer: TRACER }, () => 'ticked')).toBe('ticked');
    });

    it('Should record a skip without throwing', () => {
        expect(() => recordJobSkip({ name: JOB, reason: JOB_SKIP_REASON_VALUE_NOTHING_DUE })).not.toThrow();
    });
});
