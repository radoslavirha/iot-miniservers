import { metrics, type Attributes, type Counter, type Histogram, type MeterProvider, type Span } from '@opentelemetry/api';
import {
    ATTR_ERROR_TYPE,
    ERROR_TYPE_VALUE_OTHER,
    ATTR_NETWORK_TRANSPORT,
    ATTR_SERVER_ADDRESS,
    ATTR_SERVER_PORT,
    NETWORK_TRANSPORT_VALUE_UDP
} from '@opentelemetry/semantic-conventions';
import {
    ATTR_RPC_METHOD,
    ATTR_RPC_RESPONSE_STATUS_CODE,
    ATTR_RPC_SYSTEM_NAME,
    RPC_SYSTEM_NAME_VALUE_JSONRPC
} from '@opentelemetry/semantic-conventions/incubating';
import { MiotError, MIOT_DEFAULT_PORT, MIOT_ERROR_DEVICE_ERROR, type MiotMethod } from '@radoslavirha/miot-device';
import { getMeter, withClientSpan } from '@radoslavirha/otel';
import { CommonUtils } from '@radoslavirha/utils';
import {
    ATTR_MIOT_DEVICE_ID,
    ATTR_MIOT_PROPERTY_SOURCE,
    ATTR_MIOT_STAMP_REFRESHED,
    identifierAttribute,
    METRIC_MIOT_CLIENT_CALL_DURATION,
    METRIC_MIOT_PROPERTY_REJECTIONS,
    METRIC_MIOT_PROPERTY_UNRESOLVED,
    MIOT_CALL_DURATION_BUCKETS,
    MIOT_ERROR_TYPE_VALUE_REJECTED_LOCALLY,
    MIOT_METER_NAME,
    MIOT_TRACER_NAME,
    miotErrorType,
    miotSpanName,
    miotStatusCode,
    type MiotPropertySource
} from './telemetry.js';

/** The device a call is addressed to. `DeviceCache` satisfies this structurally. */
export interface MiotCallTarget {
    /** LAN address of the device. */
    readonly address: string;
    /** Xiaomi hardware device id. Absent during discovery, when it is what we are asking for. */
    readonly deviceId?: number;
    /** Only set when the device does not listen on {@link MIOT_DEFAULT_PORT}. */
    readonly port?: number;
}

export interface MiotCallSpanOptions {
    /** The miIO wire method. Names the span and becomes `rpc.method`. */
    readonly method: MiotMethod;
    readonly device: MiotCallTarget;
    /** Call-specific attributes: siid/piid/aiid, or the property count of a bulk read. */
    readonly attributes?: Attributes;
    /**
     * Provenance of the single property this call addresses, when it addresses exactly one.
     *
     * Omit for a bulk read: it mixes provenances, and one value would be a guess. Supplying it also
     * turns a `device_error` on this call into a {@link METRIC_MIOT_PROPERTY_REJECTIONS}
     * increment, because a refused single-property call *is* a refused spec entry.
     */
    readonly propertySource?: MiotPropertySource;
}

/**
 * Wraps a miot device call in a CLIENT span **and records its outcome as a metric**, from one call.
 *
 * The pairing is the same principle as `runJob`: whoever adds a call site gets both signals without
 * choosing, and the metric is never head-sampled away with the trace. Metrics matter more here than
 * for a request, because the poller is the dominant caller and its faults are swallowed into
 * back-off — a device that has been refusing one property for a week produces no failing span
 * anywhere and no failing job outcome either.
 *
 * `@radoslavirha/miot-device` has no OpenTelemetry dependency on purpose — it takes an injected
 * logger and nothing else — so the seam is here, at the last point that still knows which
 * device is being addressed. The call underneath is raw `dgram` with a 10s timeout and no
 * telemetry of its own: before this span existed, a device that had dropped off the LAN showed
 * up as ten silent seconds inside an HTTP or MQTT span with nothing to say what was being
 * waited on.
 *
 * A handshake triggered inside the call by a stale stamp is part of this span's duration rather
 * than a span of its own; `MiotDevice` owns that retry and reports it through
 * {@link ATTR_MIOT_STAMP_REFRESHED} rather than a span of its own.
 *
 * ### Semantic conventions
 *
 * miIO is JSON-RPC over UDP — `{ id, method, params }` out, `{ id, result | error }` back — so the
 * RPC conventions apply as they are, and nothing here needs a `miot.error_code` of its own:
 *
 * - `rpc.system.name` = `jsonrpc`. (`rpc.system` is deprecated in its favour.)
 * - `rpc.method`, fully qualified, which for miIO is just the method. (`rpc.service` is deprecated
 *   and folded into it.)
 * - `rpc.response.status_code`, **as a string**, carrying the code the device refused with.
 *   `rpc.jsonrpc.error_code` and `rpc.jsonrpc.error_message` are both deprecated in favour of this
 *   attribute plus the span status description, which `recordSpanError` already sets to the
 *   message.
 * - `error.type` for the failure class.
 *
 * `jsonrpc.protocol.version` is deliberately **not** emitted: it is defined as the value of the
 * `jsonrpc` property of the request, and a miIO packet carries no such property — the payload is
 * JSON-RPC 1.0-shaped. Asserting `"2.0"` would be a fabrication. `jsonrpc.request.id` is absent for
 * a different reason: miIO's `id` is a UNIX timestamp minted inside `OutgoingPacket` and never
 * surfaced to this seam, and an attribute present only on failures is worse than no attribute.
 *
 * `network.transport` stays even though the current RPC conventions dropped it from their span
 * set, because "this RPC runs over UDP" is the fact that explains why a failure here is ten seconds
 * of silence rather than a refused connection.
 */
export function withMiotCallSpan<T>(options: MiotCallSpanOptions, fn: (span: Span) => Promise<T>): Promise<T> {
    const startedAt = performance.now();

    return withClientSpan(
        {
            name: miotSpanName(options.method),
            tracer: MIOT_TRACER_NAME,
            attributes: {
                [ATTR_RPC_SYSTEM_NAME]: RPC_SYSTEM_NAME_VALUE_JSONRPC,
                [ATTR_RPC_METHOD]: options.method,
                [ATTR_NETWORK_TRANSPORT]: NETWORK_TRANSPORT_VALUE_UDP,
                [ATTR_SERVER_ADDRESS]: options.device.address,
                [ATTR_SERVER_PORT]: options.device.port ?? MIOT_DEFAULT_PORT,
                [ATTR_MIOT_DEVICE_ID]: identifierAttribute(options.device.deviceId),
                [ATTR_MIOT_PROPERTY_SOURCE]: options.propertySource,
                ...options.attributes
            }
        },
        async (span) => {
            try {
                const result = await fn(span);
                recordCall(options.method, startedAt);
                return result;
            } catch (error) {
                // `_OTHER` rather than a guess: an unclassified throw here is our bug, not the device's.
                const errorType = miotErrorType(error) ?? ERROR_TYPE_VALUE_OTHER;
                const statusCode = miotStatusCode(error);

                // `withClientSpan` already sets ERROR status with the message as its description
                // and records the exception. What it cannot know is *why*, which is the part worth
                // querying.
                span.setAttributes({
                    [ATTR_ERROR_TYPE]: errorType,
                    [ATTR_RPC_RESPONSE_STATUS_CODE]: statusCode,
                    [ATTR_MIOT_STAMP_REFRESHED]: MiotError.is(error) ? error.stampRefreshed : undefined
                });

                recordCall(options.method, startedAt, errorType);

                if (CommonUtils.notUndefined(options.propertySource) && MiotError.is(error) && error.kind === MIOT_ERROR_DEVICE_ERROR) {
                    recordPropertyRejection({
                        method: options.method,
                        source: options.propertySource,
                        statusCode
                    });
                }

                throw error;
            }
        }
    );
}

/**
 * Records a command our own spec validation refused, before any packet was sent.
 *
 * There is no span for this — a client span for a call that never left the process would be a lie,
 * and a test pins that — so the metric is the **only** always-on signal that Loxone is asking for a
 * key this service cannot resolve. That is the mirror image of a device refusal and just as
 * diagnostic: it means the spec is missing something the controller expects. The recorded duration
 * is ~0 by construction, which is itself the tell that no packet was sent.
 */
export function recordMiotLocalRejection(options: { readonly method: MiotMethod }): void {
    miotInstruments().callDuration.record(0, {
        [ATTR_RPC_METHOD]: options.method,
        [ATTR_ERROR_TYPE]: MIOT_ERROR_TYPE_VALUE_REJECTED_LOCALLY
    });
}

/**
 * Records one spec entry the device refused.
 *
 * Called for every non-zero per-property `code` in a bulk read — the shape that made these
 * invisible, since the RPC call wrapped around them succeeds — and automatically by
 * {@link withMiotCallSpan} for a single-property call that came back a `device_error`.
 */
export function recordPropertyRejection(options: {
    readonly method: MiotMethod;
    readonly source: MiotPropertySource;
    readonly statusCode: string | undefined;
}): void {
    miotInstruments().propertyRejections.add(1, {
        [ATTR_RPC_METHOD]: options.method,
        [ATTR_MIOT_PROPERTY_SOURCE]: options.source,
        [ATTR_RPC_RESPONSE_STATUS_CODE]: options.statusCode
    });
}

/**
 * Records spec keys a bulk read asked for and could not resolve.
 *
 * Counted once per call with the number of keys, not once per key: the call is the event, and the
 * keys themselves are on the span and in the log. No span is raised here — like
 * {@link recordMiotLocalRejection}, nothing left the process, and when *every* key is unresolvable
 * there is no device call to hang an attribute on at all. That case is the one this exists for.
 */
export function recordPropertyUnresolved(options: { readonly method: MiotMethod; readonly count: number }): void {
    miotInstruments().propertyUnresolved.add(options.count, {
        [ATTR_RPC_METHOD]: options.method
    });
}

function recordCall(method: MiotMethod, startedAt: number, errorType?: string): void {
    miotInstruments().callDuration.record((performance.now() - startedAt) / 1_000, {
        [ATTR_RPC_METHOD]: method,
        // Absent on success, per semconv. `error_type=""` is the success series in PromQL.
        [ATTR_ERROR_TYPE]: errorType
    });
}

interface MiotInstruments {
    readonly callDuration: Histogram;
    readonly propertyRejections: Counter;
    readonly propertyUnresolved: Counter;
}

/**
 * Instruments, built once per meter provider.
 *
 * Same reason as `jobTelemetry`: the metrics API has no proxy provider, so an instrument created at
 * module load binds to the no-op provider forever and silently disables every metric here depending
 * on import order. Keying the cache on the provider discards the no-op instruments the moment a
 * real provider registers.
 */
const instrumentsByProvider = new WeakMap<MeterProvider, MiotInstruments>();

function miotInstruments(): MiotInstruments {
    const provider = metrics.getMeterProvider();
    const cached = instrumentsByProvider.get(provider);

    if (CommonUtils.notUndefined(cached)) {
        return cached;
    }

    const meter = getMeter(MIOT_METER_NAME);
    const created: MiotInstruments = {
        callDuration: meter.createHistogram(METRIC_MIOT_CLIENT_CALL_DURATION, {
            description: 'Duration of one miot (JSON-RPC over UDP) call to a device.',
            unit: 's',
            advice: { explicitBucketBoundaries: [...MIOT_CALL_DURATION_BUCKETS] }
        }),
        propertyRejections: meter.createCounter(METRIC_MIOT_PROPERTY_REJECTIONS, {
            description: 'Spec entries a device refused, by status code and whether the entry is published or ours.',
            unit: '{rejection}'
        }),
        propertyUnresolved: meter.createCounter(METRIC_MIOT_PROPERTY_UNRESOLVED, {
            description: 'Spec keys a bulk read asked for that the merged spec could not resolve, so they never reached the device.',
            unit: '{property}'
        })
    };

    instrumentsByProvider.set(provider, created);

    return created;
}
