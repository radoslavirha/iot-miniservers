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

/** Wire-level miot methods, used as the CLIENT span names so a span reads like the packet. */
export const SPAN_MIOT_GET_PROPERTIES = 'miot get_properties';
export const SPAN_MIOT_SET_PROPERTIES = 'miot set_properties';
export const SPAN_MIOT_ACTION = 'miot action';
export const SPAN_MIOT_HANDSHAKE = 'miot handshake';

/**
 * Xiaomi hardware device id — the number the device reports at handshake, the same value
 * `mqttTracing` call sites already emit. Not the storage id.
 */
export const ATTR_MIOT_DEVICE_ID = 'miot.device.id';

/**
 * Storage id of the device record (`Device.id`), which is what the poller and the notification
 * subscriptions are keyed by. Separate from {@link ATTR_MIOT_DEVICE_ID} on purpose: reusing one
 * key for two different identifiers makes every query on it wrong for half the spans.
 */
export const ATTR_MIOT_DEVICE_STORAGE_ID = 'miot.device.storage_id';

/** Spec property or action key as the caller asked for it, e.g. `vacuum:status`. */
export const ATTR_MIOT_COMMAND = 'miot.command';

/** `DeviceCommandOperation` value. */
export const ATTR_MIOT_OPERATION = 'miot.operation';

/** Single property key a notification or poll result refers to. */
export const ATTR_MIOT_PROPERTY = 'miot.property';

/** Number of properties in a bulk read. */
export const ATTR_MIOT_PROPERTY_COUNT = 'miot.property.count';

/** miot spec service / property / action instance ids. */
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
