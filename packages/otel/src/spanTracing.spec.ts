import { context, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import {
    InMemorySpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
    type ReadableSpan
} from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordSpanError, withClientSpan, withEntryPointSpan, withSpan } from './spanTracing.js';

const exporter = new InMemorySpanExporter();

const TRACER = 'test';

const spans = (): ReadableSpan[] => exporter.getFinishedSpans();

const spanNamed = (name: string): ReadableSpan => {
    const span = spans().find((candidate) => candidate.name === name);
    if (span === undefined) {
        throw new Error(`No span named "${name}". Got: ${spans().map((s) => s.name).join(', ')}`);
    }
    return span;
};

/** Stands in for an auto-instrumentation: knows nothing, attaches to whatever is current. */
const raiseDownstreamSpan = (name = 'downstream'): void => trace.getTracer('downstream').startSpan(name).end();

describe('spanTracing', () => {
    // The helpers read the *global* tracer and context manager exactly as they do in an app, so
    // these assertions cover that wiring — including the SDK's own suppression check, which is
    // what makes `suppress` drop a whole subtree rather than only the wrapper span.
    beforeAll(() => {
        new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();
    });

    afterAll(() => {
        trace.disable();
        propagation.disable();
        context.disable();
    });

    beforeEach(() => exporter.reset());

    describe('withSpan', () => {
        it('Should emit an INTERNAL span with the given name and attributes by default', () => {
            withSpan({ name: 'work', tracer: TRACER, attributes: { 'miot.device.id': 442 } }, () => undefined);

            const span = spanNamed('work');

            expect(span.kind).toBe(SpanKind.INTERNAL);
            expect(span.attributes).toMatchObject({ 'miot.device.id': 442 });
        });

        it('Should return the callback result', () => {
            expect(withSpan({ name: 'work', tracer: TRACER }, () => 'done')).toBe('done');
        });

        it('Should hand the callback the span it created', () => {
            let received: Span | undefined;

            withSpan({ name: 'work', tracer: TRACER }, (span) => (received = span));

            expect(received?.spanContext().spanId).toBe(spanNamed('work').spanContext().spanId);
        });

        // The whole point: work done underneath lands in the same trace without knowing a
        // wrapper exists.
        it('Should make work done inside the callback a child', () => {
            withSpan({ name: 'work', tracer: TRACER }, () => raiseDownstreamSpan());

            expect(spanNamed('downstream').parentSpanContext?.spanId).toBe(spanNamed('work').spanContext().spanId);
        });

        it('Should keep the span open until an async callback settles', async () => {
            let finish: () => void = () => undefined;
            const pending = new Promise<void>((resolve) => (finish = resolve));

            const result = withSpan({ name: 'work', tracer: TRACER }, () => pending);

            expect(spans()).toHaveLength(0);

            finish();
            await result;

            expect(spans()).toHaveLength(1);
        });

        it('Should record a rejection and rethrow it', async () => {
            const failure = new Error('device unreachable');

            await expect(withSpan({ name: 'work', tracer: TRACER }, () => Promise.reject(failure))).rejects.toThrow(
                failure
            );

            expect(spanNamed('work').status).toMatchObject({
                code: SpanStatusCode.ERROR,
                message: 'device unreachable'
            });
        });

        it('Should record a non-Error rejection', async () => {
            await expect(withSpan({ name: 'work', tracer: TRACER }, () => Promise.reject('timeout'))).rejects.toBe(
                'timeout'
            );

            expect(spanNamed('work').status).toMatchObject({ code: SpanStatusCode.ERROR, message: 'timeout' });
        });

        it('Should record a synchronous throw and rethrow it', () => {
            expect(() =>
                withSpan({ name: 'work', tracer: TRACER }, () => {
                    throw new Error('bad state');
                })
            ).toThrow('bad state');

            expect(spanNamed('work').status.code).toBe(SpanStatusCode.ERROR);
        });

        it('Should nest under the active span by default', () => {
            withSpan({ name: 'outer', tracer: TRACER }, () => withSpan({ name: 'inner', tracer: TRACER }, () => undefined));

            expect(spanNamed('inner').parentSpanContext?.spanId).toBe(spanNamed('outer').spanContext().spanId);
        });

        // A timer callback inherits the context that scheduled it. Without `root` a loop which
        // reschedules itself from inside its own span chains every tick onto the first one.
        it('Should ignore the active span when root is set', () => {
            withSpan({ name: 'outer', tracer: TRACER }, () =>
                withSpan({ name: 'tick', tracer: TRACER, root: true }, () => undefined)
            );

            expect(spanNamed('tick').parentSpanContext).toBeUndefined();
            expect(spanNamed('tick').spanContext().traceId).not.toBe(spanNamed('outer').spanContext().traceId);
        });

        it('Should parent to an explicitly supplied context', () => {
            const traceId = '0af7651916cd43dd8448eb211c80319c';
            const parentSpanId = 'b7ad6b7169203331';
            const parent = propagation.extract(ROOT_CONTEXT, { traceparent: `00-${traceId}-${parentSpanId}-01` });

            withSpan({ name: 'work', tracer: TRACER, parent }, () => undefined);

            expect(spanNamed('work').spanContext().traceId).toBe(traceId);
            expect(spanNamed('work').parentSpanContext?.spanId).toBe(parentSpanId);
        });
    });

    describe('withSpan with suppress', () => {
        it('Should still run the callback and return its result', () => {
            expect(withSpan({ name: 'tick', tracer: TRACER, suppress: true }, () => 'polled')).toBe('polled');
        });

        it('Should emit no span of its own', () => {
            withSpan({ name: 'tick', tracer: TRACER, suppress: true }, () => undefined);

            expect(spans()).toHaveLength(0);
        });

        // The reason `suppress` exists rather than simply skipping the wrapper: with no span and
        // no suppression these downstream spans become parentless traces of their own, which is
        // the flood the wrapper is meant to remove.
        it('Should drop spans raised underneath instead of orphaning them', () => {
            withSpan({ name: 'tick', tracer: TRACER, suppress: true, root: true }, () => raiseDownstreamSpan());

            expect(spans()).toHaveLength(0);
        });

        it('Should leave no active span for a suppressed root, so its logs claim no trace', () => {
            let active: Span | undefined = trace.getTracer(TRACER).startSpan('placeholder');

            withSpan({ name: 'outer', tracer: TRACER }, () =>
                withSpan({ name: 'tick', tracer: TRACER, suppress: true, root: true }, () => {
                    active = trace.getSpan(context.active());
                })
            );

            expect(active).toBeUndefined();
        });

        it('Should keep the caller span current for a suppressed nested call', () => {
            let active: Span | undefined;

            withSpan({ name: 'outer', tracer: TRACER }, (outer) => {
                withSpan({ name: 'inner', tracer: TRACER, suppress: true }, () => {
                    active = trace.getSpan(context.active());
                });

                expect(active?.spanContext().spanId).toBe(outer.spanContext().spanId);
            });
        });

        it('Should suppress under an explicitly supplied parent', () => {
            const parent = trace.setSpan(ROOT_CONTEXT, trace.getTracer(TRACER).startSpan('carrier'));

            withSpan({ name: 'tick', tracer: TRACER, suppress: true, parent }, () => raiseDownstreamSpan());

            expect(spans().map((span) => span.name)).not.toContain('downstream');
        });
    });

    describe('withEntryPointSpan', () => {
        it('Should root the trace even when a span is somehow active', () => {
            withSpan({ name: 'stale', tracer: TRACER }, () =>
                withEntryPointSpan({ name: 'tick', tracer: TRACER }, () => raiseDownstreamSpan())
            );

            const tick = spanNamed('tick');

            expect(tick.kind).toBe(SpanKind.INTERNAL);
            expect(tick.parentSpanContext).toBeUndefined();
            expect(spanNamed('downstream').parentSpanContext?.spanId).toBe(tick.spanContext().spanId);
        });

        it('Should accept a CONSUMER kind for something arriving from outside', () => {
            withEntryPointSpan({ name: 'process udp command', tracer: TRACER, kind: SpanKind.CONSUMER }, () => undefined);

            expect(spanNamed('process udp command').kind).toBe(SpanKind.CONSUMER);
        });

        // A carrier that did contain trace context is the one case where an entry point is not a
        // root — the caller's trace continues through it.
        it('Should continue the trace when a parent context is supplied', () => {
            const traceId = '0af7651916cd43dd8448eb211c80319c';
            const parent = propagation.extract(ROOT_CONTEXT, {
                traceparent: `00-${traceId}-b7ad6b7169203331-01`
            });

            withEntryPointSpan({ name: 'process', tracer: TRACER, parent }, () => undefined);

            expect(spanNamed('process').spanContext().traceId).toBe(traceId);
        });
    });

    describe('withClientSpan', () => {
        it('Should emit a CLIENT span nested under the entry point', () => {
            withEntryPointSpan({ name: 'tick', tracer: TRACER }, () =>
                withClientSpan(
                    { name: 'miot get_properties', tracer: TRACER, attributes: { 'network.transport': 'udp' } },
                    () => undefined
                )
            );

            const call = spanNamed('miot get_properties');

            expect(call.kind).toBe(SpanKind.CLIENT);
            expect(call.attributes).toMatchObject({ 'network.transport': 'udp' });
            expect(call.parentSpanContext?.spanId).toBe(spanNamed('tick').spanContext().spanId);
        });
    });

    describe('recordSpanError', () => {
        it('Should mark a handled fault failed and attach it as an exception', () => {
            withSpan({ name: 'work', tracer: TRACER }, (span) => recordSpanError(span, new Error('invalid json')));

            const span = spanNamed('work');

            expect(span.status).toMatchObject({ code: SpanStatusCode.ERROR, message: 'invalid json' });
            expect(span.events[0]?.name).toBe('exception');
        });

        it('Should accept a non-Error value', () => {
            withSpan({ name: 'work', tracer: TRACER }, (span) => recordSpanError(span, 'validation failed'));

            expect(spanNamed('work').status.message).toBe('validation failed');
        });
    });
});

// A no-op tracer is what every local `pnpm start` gets: `--import instrument.js` is only wired
// into `start:prod`, so the helpers must stay inert rather than throw.
describe('spanTracing without an SDK', () => {
    it('Should run the callback and return its value', () => {
        expect(withEntryPointSpan({ name: 'tick', tracer: TRACER }, () => 'ticked')).toBe('ticked');
    });

    it('Should run a suppressed callback and return its value', () => {
        expect(withSpan({ name: 'tick', tracer: TRACER, suppress: true }, () => 'ticked')).toBe('ticked');
    });
});
