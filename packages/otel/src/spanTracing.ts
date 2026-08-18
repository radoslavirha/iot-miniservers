import {
    context,
    INVALID_SPAN_CONTEXT,
    SpanKind,
    SpanStatusCode,
    trace,
    type Attributes,
    type Context,
    type Span
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { getTracer } from './telemetry.js';

export interface WithSpanOptions {
    /**
     * Span name. Must be **low cardinality** — it is what Tempo groups by, so anything
     * carrying a device id, topic or request id belongs in an attribute instead.
     */
    readonly name: string;
    /** Instrumentation scope, named after the thing being traced (`mqtt`, `udp`, `miot`). */
    readonly tracer: string;
    readonly kind?: SpanKind;
    readonly attributes?: Attributes;
    /**
     * Explicit parent, e.g. one extracted from an inbound carrier. Defaults to the active
     * context.
     */
    readonly parent?: Context;
    /**
     * Starts a new trace, ignoring any span that happens to be active.
     *
     * Required for anything driven by a timer: a `setTimeout` callback inherits the context
     * that scheduled it, so a loop which reschedules itself from inside its own span would
     * chain every future tick onto the first one and grow a single unbounded trace.
     */
    readonly root?: boolean;
    /**
     * Runs `fn` with tracing suppressed instead of creating a span — the "not sampled" case
     * for a high-frequency caller that decides per invocation.
     *
     * This is not the same as skipping the wrapper. With no span and no suppression, every
     * auto-instrumented call underneath (Mongo, HTTP) becomes its own parentless trace, which
     * is precisely the flood this helper exists to prevent. Under suppression the SDK's tracer
     * hands those instrumentations a non-recording span, so the whole subtree is dropped.
     */
    readonly suppress?: boolean;
}

/** Options for {@link withEntryPointSpan}; `root` is decided by the helper. */
export type EntryPointSpanOptions = Omit<WithSpanOptions, 'root'>;

/** Options for {@link withClientSpan}; `kind` is fixed. */
export type ClientSpanOptions = Omit<WithSpanOptions, 'kind'>;

/**
 * Runs `fn` inside a span that is **active** for its whole duration, ending it when the result
 * settles.
 *
 * Being active is the entire point: the Mongo, HTTP and Winston instrumentations know nothing
 * about the caller and simply attach to whatever span is current. Wrap the *whole* unit of
 * work — including the response or reply — or the rest of the journey detaches into its own
 * trace.
 *
 * Handles the sync and async cases from one place: a thenable result ends the span on
 * settlement, anything else ends it immediately. Errors are recorded and rethrown —
 * instrumentation must never swallow a failure.
 *
 * Prefer {@link withEntryPointSpan} or {@link withClientSpan}, which fix the decisions that
 * are easy to get wrong; reach for this directly only when neither shape fits.
 */
export function withSpan<T>(options: WithSpanOptions, fn: (span: Span) => T): T {
    if (options.suppress === true) {
        return context.with(suppressedContext(options), () => fn(trace.wrapSpanContext(INVALID_SPAN_CONTEXT)));
    }

    return getTracer(options.tracer).startActiveSpan(
        options.name,
        {
            kind: options.kind ?? SpanKind.INTERNAL,
            attributes: options.attributes,
            root: options.root
        },
        options.parent ?? context.active(),
        (span) => endOnSettle(span, fn)
    );
}

/**
 * Roots a trace for work this process starts by itself: a timer tick, a startup task, an
 * inbound datagram — anything that is not an HTTP request (already covered by
 * auto-instrumentation) or an MQTT message (covered by `mqttTracing`).
 *
 * Without one of these, every span raised underneath by an auto-instrumentation becomes its
 * own parentless trace, and every log line written underneath has no `trace_id` — there is no
 * span for the Winston instrumentation to read one from.
 *
 * Pass `kind: SpanKind.CONSUMER` for something that arrived from outside the process and
 * leave the default `INTERNAL` for a timer. Pass `parent` only when an inbound carrier
 * actually contained trace context; otherwise the span is deliberately made a root.
 */
export function withEntryPointSpan<T>(options: EntryPointSpanOptions, fn: (span: Span) => T): T {
    return withSpan({ ...options, root: options.parent === undefined }, fn);
}

/**
 * Wraps an outbound call to something outside this process — a device, a socket, an API — in a
 * CLIENT span nested under whatever is currently active.
 *
 * Never a root: a client call with no caller above it is a call nobody asked for. If one shows
 * up as a root in Tempo, the entry point that triggered it is the thing that is missing a
 * span.
 */
export function withClientSpan<T>(options: ClientSpanOptions, fn: (span: Span) => T): T {
    return withSpan({ ...options, kind: SpanKind.CLIENT }, fn);
}

/**
 * Marks a span failed and attaches the exception.
 *
 * Use for a fault the caller handles itself — turning it into an error reply rather than
 * throwing — since {@link withSpan} only ever sees the ones that propagate. Without this a
 * request that answered `error: …` looks successful in Tempo.
 */
export function recordSpanError(span: Span, error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    span.recordException(normalized);
    span.setStatus({ code: SpanStatusCode.ERROR, message: normalized.message });
}

/**
 * The context a suppressed invocation runs in.
 *
 * For a suppressed *root* the active span is dropped as well as tracing suppressed: a timer
 * callback can inherit a stale span from whatever scheduled it, and leaving it current would
 * stamp its `trace_id` onto every log line of an invocation that emits no trace at all. A
 * suppressed nested call keeps its caller's span current, so those log lines still correlate
 * with the trace they belong to.
 */
function suppressedContext(options: WithSpanOptions): Context {
    const base = suppressTracing(options.parent ?? context.active());

    return options.root === true ? trace.deleteSpan(base) : base;
}

function endOnSettle<T>(span: Span, fn: (span: Span) => T): T {
    let result: T;

    try {
        result = fn(span);
    } catch (error) {
        recordSpanError(span, error);
        span.end();
        throw error;
    }

    if (!isPromiseLike(result)) {
        span.end();
        return result;
    }

    return result.then(
        (value) => {
            span.end();
            return value;
        },
        (error: unknown) => {
            recordSpanError(span, error);
            span.end();
            throw error;
        }
    ) as T;
}

/**
 * Whether a callback result needs to be awaited before the work is over.
 *
 * Exported for `jobTelemetry`, which has to settle a result the same way to time it, and must
 * agree with this module exactly — a helper that ended its span on one rule and stopped its clock
 * on another would report durations that disagree with the spans describing them. Not part of the
 * package's public API.
 *
 * @internal
 */
export function isPromiseLike<T>(value: T): value is T & PromiseLike<unknown> {
    return typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';
}
