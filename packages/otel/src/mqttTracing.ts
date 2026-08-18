import { context, propagation, SpanKind, type Attributes, type Context, type Span } from '@opentelemetry/api';
import {
    ATTR_MESSAGING_CLIENT_ID,
    ATTR_MESSAGING_DESTINATION_NAME,
    ATTR_MESSAGING_DESTINATION_TEMPLATE,
    ATTR_MESSAGING_MESSAGE_BODY_SIZE,
    ATTR_MESSAGING_OPERATION_NAME,
    ATTR_MESSAGING_OPERATION_TYPE,
    ATTR_MESSAGING_SYSTEM,
    MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
    MESSAGING_OPERATION_TYPE_VALUE_SEND
} from '@opentelemetry/semantic-conventions/incubating';
import { ATTR_SERVER_ADDRESS, ATTR_SERVER_PORT } from '@opentelemetry/semantic-conventions';
import { withSpan } from './spanTracing.js';

/**
 * Instrumentation scope for every MQTT span. Named after the wire protocol rather than the
 * client library so it stays accurate if `mqtt` is ever swapped out.
 */
export const MQTT_TRACER_NAME = 'mqtt';

/** `messaging.system` value. Semconv ships no enum member for MQTT, so this is the literal. */
export const MESSAGING_SYSTEM_MQTT = 'mqtt';

/** MQTT-specific attribute; no stable semconv equivalent exists. */
export const ATTR_MESSAGING_MQTT_QOS = 'messaging.mqtt.qos';

/**
 * MQTT 5 user properties as MQTT.js models them. Values arrive as an array whenever the same
 * key appears more than once in the packet, which the broker permits.
 */
export type MqttUserProperties = Record<string, string | string[]>;

export interface MqttSpanOptions {
    /** Concrete topic, e.g. `miot-bridge/device/442/command`. */
    readonly topic: string;
    /**
     * Low-cardinality form of {@link topic}, e.g. `miot-bridge/device/{deviceId}/command`.
     *
     * The span *name* is built from this, never from {@link topic}: every topic here embeds a
     * device id, and naming spans after the concrete topic gives Tempo one span name per
     * device — which breaks grouping, the service graph, and every latency aggregate.
     */
    readonly topicTemplate: string;
    readonly qos?: number;
    readonly bodySize?: number;
    readonly clientId?: string;
    /** Broker URL. Only host and port are read from it; credentials are never touched. */
    readonly brokerUrl?: string;
    /** Application attributes, e.g. `miot.device.id`. */
    readonly attributes?: Attributes;
}

export interface MqttConsumeSpanOptions extends MqttSpanOptions {
    /** User properties off the inbound packet, carrying `traceparent` when the sender set it. */
    readonly userProperties?: MqttUserProperties;
}

/**
 * Wraps an outbound MQTT publish in a PRODUCER span and hands the callback the user properties
 * to attach to it, so a consumer downstream continues this trace rather than starting its own.
 *
 * The callback runs *inside* the span's context, so anything it triggers nests underneath.
 * The span ends when the callback returns — MQTT.js resolves its publish callback on the
 * broker acknowledgement for QoS 1 and 2, so passing an async callback measures the real
 * round trip, while a synchronous one measures only the handoff to the client.
 *
 * @example
 * withMqttPublishSpan({ topic, topicTemplate, qos: 1 }, (userProperties) =>
 *     client.publishAsync(topic, body, { qos: 1, properties: { userProperties } })
 * );
 */
export function withMqttPublishSpan<T>(
    options: MqttSpanOptions,
    fn: (userProperties: Record<string, string>, span: Span) => T
): T {
    return withSpan(
        {
            name: `publish ${options.topicTemplate}`,
            tracer: MQTT_TRACER_NAME,
            kind: SpanKind.PRODUCER,
            attributes: buildAttributes(options, 'publish', MESSAGING_OPERATION_TYPE_VALUE_SEND)
        },
        (span) => {
            const userProperties: Record<string, string> = {};

            // Injected from the active context rather than a hand-built one: `withSpan` has
            // already made this span current, so the carrier names it as the parent.
            propagation.inject(context.active(), userProperties);

            return fn(userProperties, span);
        }
    );
}

/**
 * Wraps the handling of an inbound MQTT message in a CONSUMER span, parented to the
 * `traceparent` in the packet's user properties when the sender provided one.
 *
 * The handler runs inside the span's context, which is what makes the HTTP and Mongo spans
 * raised further down — by the auto-instrumentations, with no MQTT awareness of their own —
 * children of the message that caused them. Wrap the *whole* handler, response publish
 * included; wrapping only the parse or only the command call leaves the rest of the journey
 * detached.
 */
export function withMqttConsumeSpan<T>(options: MqttConsumeSpanOptions, fn: (span: Span) => T): T {
    return withSpan(
        {
            name: `process ${options.topicTemplate}`,
            tracer: MQTT_TRACER_NAME,
            kind: SpanKind.CONSUMER,
            attributes: buildAttributes(options, 'process', MESSAGING_OPERATION_TYPE_VALUE_PROCESS),
            parent: extractMqttContext(options.userProperties)
        },
        fn
    );
}

/**
 * Restores the trace context a sender put in MQTT 5 user properties, falling back to the
 * active context when there is none — so a message published by a client that does not
 * propagate simply starts a new trace instead of failing.
 */
export function extractMqttContext(userProperties?: MqttUserProperties): Context {
    if (userProperties === undefined) {
        return context.active();
    }

    return propagation.extract(context.active(), toTextMap(userProperties));
}

/**
 * Flattens user properties into the plain string map the propagator expects.
 *
 * MQTT 5 permits the same key more than once, which MQTT.js surfaces as an array. Every
 * header the propagators read — `traceparent`, `tracestate`, `baggage` — is single-valued, so
 * the first entry wins; a duplicate is a malformed sender, not a list worth merging.
 */
function toTextMap(userProperties: MqttUserProperties): Record<string, string> {
    const carrier: Record<string, string> = {};

    for (const [key, value] of Object.entries(userProperties)) {
        const first = Array.isArray(value) ? value[0] : value;

        if (first !== undefined) {
            carrier[key] = first;
        }
    }

    return carrier;
}

function buildAttributes(options: MqttSpanOptions, operationName: string, operationType: string): Attributes {
    return {
        [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_MQTT,
        [ATTR_MESSAGING_OPERATION_NAME]: operationName,
        [ATTR_MESSAGING_OPERATION_TYPE]: operationType,
        [ATTR_MESSAGING_DESTINATION_NAME]: options.topic,
        [ATTR_MESSAGING_DESTINATION_TEMPLATE]: options.topicTemplate,
        [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: options.bodySize,
        [ATTR_MESSAGING_CLIENT_ID]: options.clientId,
        [ATTR_MESSAGING_MQTT_QOS]: options.qos,
        ...parseBroker(options.brokerUrl),
        ...options.attributes
    };
}

/**
 * Splits a broker URL into `server.address` / `server.port`.
 *
 * Only host and port are read. Credentials never appear in this URL — `MqttClientProvider`
 * passes username and password as separate connect options — but the parse is scoped to the
 * two fields regardless, so a URL that ever grows a userinfo section cannot leak it into a
 * span attribute.
 */
function parseBroker(brokerUrl?: string): Attributes {
    if (brokerUrl === undefined) {
        return {};
    }

    try {
        const { hostname, port } = new URL(brokerUrl);
        return {
            [ATTR_SERVER_ADDRESS]: hostname,
            [ATTR_SERVER_PORT]: port === '' ? undefined : Number(port)
        };
    } catch {
        return {};
    }
}
