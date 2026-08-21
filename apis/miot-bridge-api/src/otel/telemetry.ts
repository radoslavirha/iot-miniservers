import { ERROR_TYPE_VALUE_OTHER } from '@opentelemetry/semantic-conventions';
import {
    MiotError,
    MIOT_ERROR_DEVICE_ERROR,
    MIOT_ERROR_TIMEOUT,
    MIOT_ERROR_TRANSPORT_ERROR,
    MIOT_METHOD_ACTION,
    MIOT_METHOD_GET_PROPERTIES,
    MIOT_METHOD_HANDSHAKE,
    MIOT_METHOD_SET_PROPERTIES,
    type MiotMethod
} from '@radoslavirha/miot-device';
import { CommonUtils } from '@radoslavirha/utils';

/**
 * Every name this app puts on a span or a metric, in one place.
 *
 * Span names, attribute keys and `job.name` values are a query contract: a Tempo query, a Grafana
 * panel or a derived field breaks silently when one drifts, and a mistyped attribute key is simply
 * invisible — the span still exports, just without the field anyone filters on. Constants make
 * the drift a compile error and let a test assert the wire string once.
 *
 * A `job.name` value is the strictest of the three. It is a **metric** attribute, so every value
 * ever emitted becomes a permanent Prometheus series on all three `job.*` instruments; the list
 * below is the entire set this app can produce.
 *
 * An attribute's **type** is part of that contract too: every `miot.*` identifier below is emitted
 * as a string and every `miot.*` quantity as a number. See {@link identifierAttribute}.
 */

/** Instrumentation scope for the miot device protocol, named after the protocol not the client. */
export const MIOT_TRACER_NAME = 'miot';

/** Instrumentation scope for the property poller. */
export const POLLER_TRACER_NAME = 'device-poller';

/** Instrumentation scope for the inbound UDP command listener. */
export const UDP_TRACER_NAME = 'udp';

/**
 * Span names. All low cardinality — never interpolate a device id, topic or property into one,
 * or Tempo gets one span name per device and every latency aggregate stops grouping.
 */
export const SPAN_POLL_SUBSCRIPTIONS_LOAD = 'load poll subscriptions';
export const SPAN_POLL_TICK = 'poll device properties';
export const SPAN_POLL_DEVICE = 'poll device';
export const SPAN_UDP_COMMAND = 'process udp command';

/**
 * `job.name` values — the bounded set of scheduled work this app runs.
 *
 * `snake_case` rather than the spaced span names: these are metric attribute values, and Grafana
 * label values with spaces are miserable to write queries against.
 *
 * The UDP listener is deliberately absent. A datagram from Loxone is request traffic whose rate a
 * client sets, not work this process scheduled, and filing it under `job.*` would break every
 * panel that reads a run rate off these instruments.
 */
export const JOB_POLL_DEVICE_PROPERTIES = 'poll_device_properties';
export const JOB_POLL_SUBSCRIPTIONS_LOAD = 'load_poll_subscriptions';

/**
 * CLIENT span names for miot calls, derived from the wire method so a span reads like the packet
 * and cannot drift from the `rpc.method` attribute beside it.
 *
 * This is also the RPC span naming convention: a client span is named after the method it calls.
 */
export const miotSpanName = (method: MiotMethod): string => `miot ${method}`;

export const SPAN_MIOT_GET_PROPERTIES = miotSpanName(MIOT_METHOD_GET_PROPERTIES);
export const SPAN_MIOT_SET_PROPERTIES = miotSpanName(MIOT_METHOD_SET_PROPERTIES);
export const SPAN_MIOT_ACTION = miotSpanName(MIOT_METHOD_ACTION);
export const SPAN_MIOT_HANDSHAKE = miotSpanName(MIOT_METHOD_HANDSHAKE);

/**
 * Xiaomi hardware device id — the number the device reports at handshake, the same value
 * `mqttTracing` call sites already emit. Not the storage id.
 *
 * An identifier, so it goes on the span as a **string** via {@link identifierAttribute}.
 */
export const ATTR_MIOT_DEVICE_ID = 'miot.device.id';

/**
 * Storage id of the device record (`Device.id`), which is what the poller and the notification
 * subscriptions are keyed by. Separate from {@link ATTR_MIOT_DEVICE_ID} on purpose: reusing one
 * key for two different identifiers makes every query on it wrong for half the spans.
 *
 * Already a string at the source; still goes through {@link identifierAttribute} so every
 * identifier call site reads the same and a future change of storage id type cannot slip a number
 * onto a span.
 */
export const ATTR_MIOT_DEVICE_STORAGE_ID = 'miot.device.storage_id';

/** Spec property or action key as the caller asked for it, e.g. `vacuum:status`. */
export const ATTR_MIOT_COMMAND = 'miot.command';

/** `DeviceCommandOperation` value. */
export const ATTR_MIOT_OPERATION = 'miot.operation';

/** Single property key a notification or poll result refers to. */
export const ATTR_MIOT_PROPERTY = 'miot.property';

/** Number of properties in a bulk read. A quantity — stays numeric. */
export const ATTR_MIOT_PROPERTY_COUNT = 'miot.property.count';

/**
 * miot spec service / property / action instance ids — the coordinates a call is addressed to,
 * e.g. `siid=2,piid=1` is "the vacuum service's status property".
 *
 * Identifiers, not indices, despite looking like small ordinals: nothing offsets, sums or ranges
 * over them, and `siid + 1` addresses an unrelated service rather than the next one. Strings, via
 * {@link identifierAttribute}.
 */
export const ATTR_MIOT_SIID = 'miot.siid';
export const ATTR_MIOT_PIID = 'miot.piid';
export const ATTR_MIOT_AIID = 'miot.aiid';

/** Devices actually polled in this tick — subscribed minus those in error back-off. */
export const ATTR_MIOT_POLL_DEVICE_COUNT = 'miot.poll.device.count';

/**
 * Devices polled in this tick that are mid-failure (at least one consecutive error recorded).
 * Non-zero is why an otherwise sampled-out tick was traced.
 */
export const ATTR_MIOT_POLL_FAILING_COUNT = 'miot.poll.failing.count';

/** Configured poll interval, so a tick's duration can be read against the budget it has. */
export const ATTR_MIOT_POLL_INTERVAL_MS = 'miot.poll.interval_ms';

/** Subscriptions loaded at startup. */
export const ATTR_MIOT_POLL_SUBSCRIPTION_COUNT = 'miot.poll.subscription.count';

/**
 * Renders an identifier for a span attribute.
 *
 * **The repo-local rule: identifier attributes are strings, quantity attributes are numbers.**
 * No semantic convention covers `miot.*`, so nothing upstream decides this for us — and OTel's own
 * identifiers are strings even when the underlying value is numeric (`service.instance.id`,
 * `messaging.message.id`, `k8s.pod.uid`). An identifier is a name for a thing; a quantity is a
 * measurement of it. `miot.device.id` is never averaged, never summed and never compared with `<`,
 * so the integer it happens to be carries no arithmetic meaning worth preserving.
 *
 * It is also load-bearing rather than cosmetic. Tempo exports a numeric attribute as `intValue`,
 * and a Grafana 13 table panel running `select(span.miot.device.id, …)` builds a sparse numeric
 * column in the nested sub-frame whenever the attribute is on **some** matched spans and not
 * others — which is always the case here, since `poll device` carries a device id and the mongoose
 * spans beside it do not. The compiled row accessor then dereferences the hole and the panel dies
 * with `TypeError: Cannot read properties of undefined (reading '0')`. String attributes with the
 * exact same sparsity (`http.request.method`, `url.path`) render fine. The failure is invisible
 * until a dashboard happens to `select()` the attribute, which is why the rule is written down
 * rather than left to taste.
 *
 * Emitting a string also removes a TraceQL trap: `span.miot.device.id = "1141132187"` quoted like
 * every other identifier filter, instead of a bare number that silently matches nothing when
 * quoted by habit.
 *
 * **Quantities keep their numeric type** — `miot.property.count`, the `miot.poll.*` counts and
 * intervals, `server.port`, `network.peer.port`, `http.response.status_code`. Those are measured,
 * aggregated, and in the semconv cases required to be integers.
 *
 * `undefined` in, `undefined` out: an absent attribute must stay absent rather than become the
 * string `"undefined"`, which is what a bare `String()` would put on a discovery handshake span.
 */
export function identifierAttribute(value: number | string): string;
export function identifierAttribute(value: number | string | undefined): string | undefined;
export function identifierAttribute(value: number | string | undefined): string | undefined {
    return CommonUtils.isUndefined(value) ? undefined : String(value);
}

/**
 * Where the siid/piid of the property being called came from.
 *
 * **This is the attribute the blackbox question turns on.** A device's published spec is
 * incomplete, so `model-property-overrides` holds entries that are not in it but that the device
 * is believed to know. When the device refuses one, `spec` vs `override` is the difference between
 * "the published spec is wrong" and "*our* unpublished addition is wrong" — and without it a
 * refusal is just a number with nobody to blame.
 *
 * An enumerated value, not an identifier: two members, and it is a metric dimension on
 * {@link METRIC_MIOT_PROPERTY_REJECTIONS}. It does **not** go on
 * {@link METRIC_MIOT_CLIENT_CALL_DURATION} — a bulk read mixes both provenances in one call, so
 * there is no honest single value for a call, and an attribute present on some series and absent
 * on others makes every `sum by` over it lie.
 */
export const ATTR_MIOT_PROPERTY_SOURCE = 'miot.property.source';

/** The property came from the device's published `rawSpec`. */
export const MIOT_PROPERTY_SOURCE_VALUE_SPEC = 'spec';

/** The property came from a `ModelPropertyOverride` row — an entry we added, not one they publish. */
export const MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE = 'override';

/** Values of {@link ATTR_MIOT_PROPERTY_SOURCE}. */
export type MiotPropertySource =
    | typeof MIOT_PROPERTY_SOURCE_VALUE_SPEC
    | typeof MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE;

/**
 * Whether the failed call had already been retried behind a fresh handshake.
 *
 * `MiotDevice.runWithStamp` retries *every* failure that way, including a `device_error` that will
 * never succeed twice, so a refused property costs a handshake plus a second round trip. Span-only:
 * it doubles the series count of anything it is put on to answer a question that only comes up
 * once you are already reading a trace.
 */
export const ATTR_MIOT_STAMP_REFRESHED = 'miot.stamp.refreshed';

/**
 * Spec keys the device refused inside a bulk read, and how many.
 *
 * A bulk `get_properties` is one RPC call that can succeed at the envelope level while refusing
 * individual properties, so the call's own `error.type` is silent about them. The keys go on the
 * span as a string array — bounded by the chunk size of 14 — because that is the one place a
 * reader can see *which* of the properties in this exact read were refused.
 */
export const ATTR_MIOT_PROPERTY_REJECTED = 'miot.property.rejected';
export const ATTR_MIOT_PROPERTY_REJECTED_COUNT = 'miot.property.rejected.count';

/**
 * `error.type` values for a miot call — the outcome taxonomy, in the **stable semconv attribute**
 * rather than a `miot.*` name of our own.
 *
 * `error.type` is the right home: semconv says to set it to capture all errors even when a
 * domain-specific code exists beside it (which is `rpc.response.status_code` here), it is required
 * on RPC client metrics when a call fails, and it is contractually low cardinality. Inventing
 * `miot.call.outcome` would duplicate it under a name no tool understands.
 *
 * Success has **no** member and emits no attribute, because semconv says instrumentations SHOULD
 * NOT set `error.type` on a successful operation. `error_type=""` is the success series in
 * PromQL — the same shape every HTTP and DB instrumentation produces.
 *
 * The members, exhaustive over how a miIO call can fail:
 *
 * | value | meaning | code? |
 * | --- | --- | --- |
 * | `timeout` | no response within `MIOT_TIMEOUT_MS` (10s). Silence | no |
 * | `device_error` | the device answered and refused. **This is the interesting one** | yes |
 * | `transport_error` | socket error, failed send, undecryptable or empty response | no |
 * | `rejected_locally` | our own spec validation refused before a packet was sent | no |
 * | `_OTHER` | something threw that the transport did not classify | no |
 *
 * `_OTHER` is semconv's own fallback and is a **fifth** value on purpose: a Mongo failure or a
 * programming error surfacing on this path is not a device fault, and labelling it one would put
 * our bugs in the device's column. It should be rare; a rising `_OTHER` series means something
 * throws here that nothing has classified.
 *
 * **`stamp_retry_exhausted` is deliberately not a member.** Every such failure is *also* a timeout,
 * a device error or a transport error, so promoting it to a peer would erase the classification on
 * exactly the calls where it matters most. It is orthogonal, and orthogonal things go in their own
 * attribute — {@link ATTR_MIOT_STAMP_REFRESHED}.
 */
export const MIOT_ERROR_TYPE_VALUE_TIMEOUT = MIOT_ERROR_TIMEOUT;
export const MIOT_ERROR_TYPE_VALUE_DEVICE_ERROR = MIOT_ERROR_DEVICE_ERROR;
export const MIOT_ERROR_TYPE_VALUE_TRANSPORT_ERROR = MIOT_ERROR_TRANSPORT_ERROR;

/**
 * Our own spec validation refused the command and no packet was ever sent.
 *
 * The mirror image of `device_error` and just as diagnostic: it means Loxone asked for a key that
 * is in neither the published spec nor the overrides. Produced in the app, never in
 * `@radoslavirha/miot-device`, which is why it is defined here and not beside the other three.
 */
export const MIOT_ERROR_TYPE_VALUE_REJECTED_LOCALLY = 'rejected_locally';

/** The bounded set of `error.type` values a miot call can produce. */
export type MiotErrorType =
    | typeof MIOT_ERROR_TYPE_VALUE_TIMEOUT
    | typeof MIOT_ERROR_TYPE_VALUE_DEVICE_ERROR
    | typeof MIOT_ERROR_TYPE_VALUE_TRANSPORT_ERROR
    | typeof MIOT_ERROR_TYPE_VALUE_REJECTED_LOCALLY
    | typeof ERROR_TYPE_VALUE_OTHER;

/**
 * `rpc.response.status_code` for a property the device left out of its response entirely.
 *
 * `DeviceCommandService.getProperties` fills a missing result item with `-1`, which is **not** a
 * miIO code — putting it on the attribute would invent a device answer that never happened, and it
 * would sort in among the real negative codes. `_MISSING` follows the semconv `_OTHER` precedent:
 * a leading underscore marks a value the instrumentation minted rather than one the domain
 * defines. Semconv explicitly delegates this — *"conventions for individual RPC frameworks SHOULD
 * document what `rpc.response.status_code` means in the context of that system"*.
 *
 * It is a real signal, not noise: a device that silently drops an unknown siid/piid from a bulk
 * read answers the same question a `-4004` does.
 */
export const MIOT_STATUS_CODE_VALUE_MISSING = '_MISSING';

/** Sentinel `code` used for a property the device omitted from a bulk read response. */
export const MIOT_PROPERTY_CODE_MISSING = -1;

/** Instrumentation scope for miot call metrics, named after the protocol like the tracer. */
export const MIOT_METER_NAME = 'miot';

/**
 * Duration of one miot call, in **seconds**. Histogram.
 *
 * ### Why not `rpc.client.call.duration`
 *
 * Shaped after it deliberately, and named locally on purpose. The RPC client metric conventions
 * make **`server.address` a required attribute** (elevated from recommended in the current
 * registry), and `server.address` here is one LAN address per physical device — the same
 * per-device cardinality this repo already refuses to put on `job.*`. Emitting the reserved
 * `rpc.client.call.duration` name without a required attribute would produce a non-conformant
 * metric under a name that tools and dashboards assume is conformant, which is worse than a name
 * of our own. This follows the same reasoning that made the job namespace `job.*` and not
 * `faas.*`.
 *
 * The shape is otherwise identical, so if the fleet ever stays small enough to afford the device
 * dimension this becomes a rename rather than a redesign.
 *
 * ### Attributes
 *
 * `rpc.method` and `error.type`, and nothing else.
 *
 * - **`rpc.method` earns its place.** Four static values, and reads, writes and actions have
 *   genuinely different latency and failure profiles — a write to a sleeping vacuum is a different
 *   event from a read. Semconv makes it conditionally required here too.
 * - **`rpc.response.status_code` is deliberately absent**, even though it is bounded. Its value is
 *   in *counting* refusals, not in timing them — nobody asks how long a `-4004` took — and putting
 *   ~15 codes on a 16-bucket histogram multiplies the series count to answer a question
 *   {@link METRIC_MIOT_PROPERTY_REJECTIONS} answers for one series per code.
 * - **No `miot.device.id`, `miot.siid`, `miot.piid`, `server.address`.** Unbounded-ish, and the
 *   repo rule is that span attributes are never copied onto metrics. They are on the span, which is
 *   where per-call detail belongs.
 */
export const METRIC_MIOT_CLIENT_CALL_DURATION = 'miot.client.call.duration';

/**
 * Spec entries the device refused. Counter.
 *
 * **This is the instrument that answers the blackbox question without opening Tempo.** One
 * increment per property the device said no to, whether that came back as a per-item `code` inside
 * a bulk read or as the failure of a single-property call.
 *
 * Not redundant with {@link METRIC_MIOT_CLIENT_CALL_DURATION}: a bulk `get_properties` that refuses
 * three of its twelve properties is a **successful** call and contributes nothing to the duration
 * histogram's error series. Every refusal the poller sees is of that shape, which is exactly why
 * they were invisible.
 *
 * ### Attributes
 *
 * - **`rpc.response.status_code`** — the miIO code as a string. The reason it is a refusal.
 * - **`miot.property.source`** — `spec` or `override`. Whose fault it is.
 * - **`rpc.method`** — `get_properties` or `set_properties`. Read-versus-write is diagnostic in its
 *   own right: a device that reads a property happily and refuses to write it is the signature of
 *   an override with the wrong `access`.
 *
 * Never the property key or the device id. The key is what makes this question interesting and it
 * is unbounded, so it lives in the structured log and on the span, both of which are trace
 * correlated. Worst case here is roughly `codes x 2 x 2` series.
 */
export const METRIC_MIOT_PROPERTY_REJECTIONS = 'miot.property.rejections';

/**
 * Bucket boundaries for {@link METRIC_MIOT_CLIENT_CALL_DURATION}, in seconds.
 *
 * The semconv-recommended RPC set is `0.005 … 10`. That is kept verbatim up to 10 and then
 * extended, because 10 is not a tail here — it is `MIOT_TIMEOUT_MS` exactly, and
 * `MiotDevice.runWithStamp` retries behind a fresh handshake, so a dead device produces a call of
 * ~20s and a chunked bulk read can exceed even that. With the semconv set those all pile into
 * `+Inf` and the p99 of a failing device becomes unreadable.
 */
export const MIOT_CALL_DURATION_BUCKETS: readonly number[] = [
    0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10, 15, 30
];

/**
 * Classifies a caught failure into an {@link MiotErrorType}, or `undefined` when it is not a miot
 * failure at all.
 *
 * A `MiotError` carries its own classification from the transport, which is the whole reason that
 * class exists. Everything else is deliberately **not** guessed at: the poller's catch also sees a
 * missing device record and any Mongo fault on the way to the socket, and folding those into
 * `transport_error` or `rejected_locally` would blame the device — or our overrides — for our own
 * bugs. Callers that must emit something use {@link ERROR_TYPE_VALUE_OTHER}; a log line simply
 * omits the field.
 *
 * `rejected_locally` is never produced here. It is set explicitly at the one place that produces
 * it, which is validation refusing a command before any packet is sent.
 */
export function miotErrorType(error: unknown): MiotErrorType | undefined {
    return MiotError.is(error) ? error.kind : undefined;
}

/**
 * The `rpc.response.status_code` for a caught failure, or `undefined` when the device supplied no
 * code — a timeout, a socket fault, or a local rejection.
 *
 * **A string**, per semconv: *"the `error.code` property of the response if it is an error response
 * recorded as a string"*. That it is a string is also load-bearing for the same reason identifiers
 * are — see {@link identifierAttribute}. A sparse *numeric* span attribute is what crashes a
 * Grafana table panel, and this attribute is sparse by construction: it is on the failing miot
 * spans and on nothing else in the trace.
 */
export function miotStatusCode(error: unknown): string | undefined {
    return MiotError.is(error) && CommonUtils.notUndefined(error.code) ? String(error.code) : undefined;
}
