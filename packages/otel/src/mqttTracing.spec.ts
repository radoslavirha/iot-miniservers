import { context, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
    InMemorySpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
    type ReadableSpan
} from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    ATTR_MESSAGING_MQTT_QOS,
    extractMqttContext,
    withMqttConsumeSpan,
    withMqttPublishSpan,
    type MqttSpanOptions
} from './mqttTracing.js';

const exporter = new InMemorySpanExporter();

const TOPIC = 'home/miot-bridge/device/442/command';
const TEMPLATE = 'home/miot-bridge/device/{deviceId}/command';

const OPTIONS: MqttSpanOptions = {
    topic: TOPIC,
    topicTemplate: TEMPLATE,
    qos: 1,
    bodySize: 42,
    clientId: 'miot-bridge',
    brokerUrl: 'mqtt://server.home:1883'
};

const spans = (): ReadableSpan[] => exporter.getFinishedSpans();

const spanNamed = (name: string): ReadableSpan => {
    const span = spans().find((candidate) => candidate.name === name);
    if (span === undefined) {
        throw new Error(`No span named "${name}". Got: ${spans().map((s) => s.name).join(', ')}`);
    }
    return span;
};

describe('mqttTracing', () => {
    // The helpers read the *global* tracer, propagator and context manager, exactly as they do
    // in an app, so the assertions cover that wiring rather than a hand-built tracer that
    // bypasses it. `register()` installs all three with the same W3C propagator and
    // AsyncLocalStorage context manager `NodeSDK` gives the real bootstrap.
    beforeAll(() => {
        new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();
    });

    afterAll(() => {
        trace.disable();
        propagation.disable();
        context.disable();
    });

    beforeEach(() => exporter.reset());

    describe('withMqttPublishSpan', () => {
        it('Should emit a PRODUCER span named after the template, not the concrete topic', () => {
            withMqttPublishSpan(OPTIONS, () => undefined);

            const span = spanNamed(`publish ${TEMPLATE}`);

            expect(span.kind).toBe(SpanKind.PRODUCER);
            expect(span.attributes).toMatchObject({
                'messaging.system': 'mqtt',
                'messaging.operation.name': 'publish',
                'messaging.operation.type': 'send',
                'messaging.destination.name': TOPIC,
                'messaging.destination.template': TEMPLATE,
                'messaging.message.body.size': 42,
                'messaging.client.id': 'miot-bridge',
                [ATTR_MESSAGING_MQTT_QOS]: 1,
                'server.address': 'server.home',
                'server.port': 1883
            });
        });

        it('Should hand the callback user properties carrying this span as the parent', () => {
            let carrier: Record<string, string> = {};

            withMqttPublishSpan(OPTIONS, (userProperties) => {
                carrier = userProperties;
            });

            const span = spanNamed(`publish ${TEMPLATE}`);
            const extracted = trace.getSpanContext(propagation.extract(ROOT_CONTEXT, carrier));

            expect(extracted?.traceId).toBe(span.spanContext().traceId);
            expect(extracted?.spanId).toBe(span.spanContext().spanId);
        });

        it('Should keep the span open until an async callback settles', async () => {
            let resolvePublish: () => void = () => undefined;
            const pending = new Promise<void>((resolve) => (resolvePublish = resolve));

            const result = withMqttPublishSpan(OPTIONS, () => pending);

            expect(spans()).toHaveLength(0);

            resolvePublish();
            await result;

            expect(spans()).toHaveLength(1);
        });

        it('Should record a rejection and rethrow it', async () => {
            const failure = new Error('broker unreachable');

            await expect(withMqttPublishSpan(OPTIONS, () => Promise.reject(failure))).rejects.toThrow(failure);

            expect(spanNamed(`publish ${TEMPLATE}`).status).toMatchObject({
                code: SpanStatusCode.ERROR,
                message: 'broker unreachable'
            });
        });

        // MQTT.js hands back plain strings in some failure paths; `recordException` needs an
        // Error, and an unhelpful status message beats a thrown TypeError inside telemetry.
        it('Should record a non-Error rejection', async () => {
            await expect(withMqttPublishSpan(OPTIONS, () => Promise.reject('puback timeout'))).rejects.toBe(
                'puback timeout'
            );

            expect(spanNamed(`publish ${TEMPLATE}`).status).toMatchObject({
                code: SpanStatusCode.ERROR,
                message: 'puback timeout'
            });
        });

        it('Should record a synchronous throw and rethrow it', () => {
            expect(() =>
                withMqttPublishSpan(OPTIONS, () => {
                    throw new Error('client not connected');
                })
            ).toThrow('client not connected');

            expect(spanNamed(`publish ${TEMPLATE}`).status.code).toBe(SpanStatusCode.ERROR);
        });
    });

    describe('withMqttConsumeSpan', () => {
        it('Should emit a CONSUMER span named after the template', async () => {
            await withMqttConsumeSpan(OPTIONS, () => Promise.resolve());

            const span = spanNamed(`process ${TEMPLATE}`);

            expect(span.kind).toBe(SpanKind.CONSUMER);
            expect(span.attributes).toMatchObject({
                'messaging.operation.name': 'process',
                'messaging.operation.type': 'process',
                'messaging.destination.name': TOPIC
            });
        });

        it('Should join the trace the sender put in the user properties', async () => {
            const traceId = '0af7651916cd43dd8448eb211c80319c';
            const parentSpanId = 'b7ad6b7169203331';

            await withMqttConsumeSpan(
                {
                    ...OPTIONS,
                    userProperties: { traceparent: `00-${traceId}-${parentSpanId}-01` }
                },
                () => Promise.resolve()
            );

            const span = spanNamed(`process ${TEMPLATE}`);

            expect(span.spanContext().traceId).toBe(traceId);
            expect(span.parentSpanContext?.spanId).toBe(parentSpanId);
        });

        // The duplicate-key form the MQTT 5 spec permits; `traceparent` is single-valued, so
        // the first entry wins rather than the array being stringified into garbage.
        it('Should accept a user property delivered as an array', async () => {
            const traceId = '0af7651916cd43dd8448eb211c80319c';

            await withMqttConsumeSpan(
                {
                    ...OPTIONS,
                    userProperties: { traceparent: [`00-${traceId}-b7ad6b7169203331-01`] }
                },
                () => Promise.resolve()
            );

            expect(spanNamed(`process ${TEMPLATE}`).spanContext().traceId).toBe(traceId);
        });

        it('Should start a new trace when the sender propagates nothing', async () => {
            await withMqttConsumeSpan({ ...OPTIONS, userProperties: {} }, () => Promise.resolve());

            expect(spanNamed(`process ${TEMPLATE}`).parentSpanContext).toBeUndefined();
        });

        it('Should ignore a user property delivered as an empty array', async () => {
            await withMqttConsumeSpan({ ...OPTIONS, userProperties: { traceparent: [] } }, () => Promise.resolve());

            expect(spanNamed(`process ${TEMPLATE}`).parentSpanContext).toBeUndefined();
        });

        // The whole point: spans raised by the auto-instrumentations while handling a message
        // must land under it, without any of them knowing MQTT exists.
        it('Should make work done inside the handler a child of the consume span', async () => {
            await withMqttConsumeSpan(OPTIONS, async () => {
                trace.getTracer('test').startSpan('downstream').end();
                await withMqttPublishSpan({ ...OPTIONS, topic: TOPIC, topicTemplate: TEMPLATE }, () =>
                    Promise.resolve()
                );
            });

            const consume = spanNamed(`process ${TEMPLATE}`);

            expect(spanNamed('downstream').parentSpanContext?.spanId).toBe(consume.spanContext().spanId);
            expect(spanNamed(`publish ${TEMPLATE}`).parentSpanContext?.spanId).toBe(consume.spanContext().spanId);
        });

        it('Should record a rejection and rethrow it', async () => {
            const failure = new Error('command failed');

            await expect(withMqttConsumeSpan(OPTIONS, () => Promise.reject(failure))).rejects.toThrow(failure);

            expect(spanNamed(`process ${TEMPLATE}`).status.code).toBe(SpanStatusCode.ERROR);
        });
    });

    describe('extractMqttContext', () => {
        it('Should fall back to the active context when there are no user properties', () => {
            expect(extractMqttContext()).toBe(context.active());
        });
    });

    describe('attributes', () => {
        it('Should omit server attributes for an unparseable broker URL', () => {
            withMqttPublishSpan({ ...OPTIONS, brokerUrl: 'not a url' }, () => undefined);

            expect(spanNamed(`publish ${TEMPLATE}`).attributes['server.address']).toBeUndefined();
        });

        it('Should omit server attributes when no broker URL is given', () => {
            withMqttPublishSpan({ topic: TOPIC, topicTemplate: TEMPLATE }, () => undefined);

            expect(spanNamed(`publish ${TEMPLATE}`).attributes['server.address']).toBeUndefined();
        });

        it('Should omit the port for a broker URL that does not carry one', () => {
            withMqttPublishSpan({ ...OPTIONS, brokerUrl: 'mqtt://server.home' }, () => undefined);

            const { attributes } = spanNamed(`publish ${TEMPLATE}`);

            expect(attributes['server.address']).toBe('server.home');
            expect(attributes['server.port']).toBeUndefined();
        });

        it('Should merge application attributes onto the span', () => {
            withMqttPublishSpan({ ...OPTIONS, attributes: { 'miot.device.id': '442' } }, () => undefined);

            expect(spanNamed(`publish ${TEMPLATE}`).attributes['miot.device.id']).toBe('442');
        });
    });
});

// A no-op tracer is what every local `pnpm start` gets: `--import instrument.js` is only wired
// into `start:prod`, so the helpers must stay inert rather than throw.
describe('mqttTracing without an SDK', () => {
    it('Should run the callback and return its value', () => {
        expect(withMqttPublishSpan(OPTIONS, () => 'published')).toBe('published');
    });
});
