import { EventEmitter } from 'events';
import { PlatformTest } from '@tsed/platform-http/testing';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
    InMemorySpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
    type ReadableSpan
} from '@opentelemetry/sdk-trace-node';
import { CommonUtils } from '@radoslavirha/utils';
import type { IPublishPacket } from 'mqtt';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { MqttListenerService } from './MqttListenerService.js';

const DEVICE_ID = 442;
const COMMAND_TOPIC = `miot-bridge/device/${DEVICE_ID}/command`;
const RESPONSE_TOPIC = `miot-bridge/device/${DEVICE_ID}/response`;
const COMMAND_SPAN = 'process miot-bridge/device/{deviceId}/command';
const RESPONSE_SPAN = 'publish miot-bridge/device/{deviceId}/response';

/**
 * Stand-in for `MqttClient`. An EventEmitter so `emit('message', …)` drives the listener the
 * way the real client does, with the two methods it calls stubbed.
 */
class FakeMqttClient extends EventEmitter {
    public readonly subscribe = vi.fn((_pattern: string, _options: unknown, cb: (err?: Error) => void) => cb());
    public readonly publishAsync = vi.fn(async () => undefined);
    public readonly endAsync = vi.fn(async () => undefined);
}

const exporter = new InMemorySpanExporter();

const spans = (): ReadableSpan[] => exporter.getFinishedSpans();

const spanNamed = (name: string): ReadableSpan => {
    const span = spans().find((candidate) => candidate.name === name);
    if (span === undefined) {
        throw new Error(`No span named "${name}". Got: ${spans().map((s) => s.name).join(', ')}`);
    }
    return span;
};

const packet = (userProperties?: Record<string, string | string[]>): IPublishPacket =>
    ({ qos: 1, properties: userProperties === undefined ? undefined : { userProperties } } as IPublishPacket);

const commandResponse = (overrides: Partial<CommandResponseModel> = {}): CommandResponseModel =>
    CommonUtils.buildModelStrict(CommandResponseModel, {
        deviceId: DEVICE_ID,
        command: 'vacuum:status',
        operation: DeviceCommandOperation.GetProperty,
        success: true,
        value: 'sweeping',
        ...overrides
    });

/** Drives one inbound message and waits for the listener's async handling to settle. */
const deliver = async (client: FakeMqttClient, body: unknown, properties?: IPublishPacket): Promise<void> => {
    const payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    client.emit('message', COMMAND_TOPIC, payload, properties ?? packet());
    await vi.waitUntil(() => spans().some((span) => span.name === COMMAND_SPAN));
};

describe('MqttListenerService', () => {
    let client: FakeMqttClient;
    let deviceCommandService: DeviceCommandService;

    // Registers the global tracer, propagator and context manager, the same three `NodeSDK`
    // installs in the real bootstrap — so these tests exercise the actual wiring.
    beforeAll(() => {
        new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();
    });

    afterAll(() => {
        trace.disable();
    });

    beforeEach(async () => {
        exporter.reset();
        client = new FakeMqttClient();
        await PlatformTest.create({ imports: [{ token: MqttClientProvider, use: client }] });
        deviceCommandService = PlatformTest.get<DeviceCommandService>(DeviceCommandService);
        vi.spyOn(deviceCommandService, 'execute').mockResolvedValue(commandResponse());
        PlatformTest.get<MqttListenerService>(MqttListenerService).$onInit();
    });

    afterEach(PlatformTest.reset);
    afterEach(() => vi.restoreAllMocks());

    describe('Subscription', () => {
        it('Should subscribe to the command pattern', () => {
            expect(client.subscribe).toHaveBeenCalledWith(
                'miot-bridge/device/+/command',
                { qos: 1 },
                expect.any(Function)
            );
        });
    });

    describe('Command handling', () => {
        it('Should execute the command and publish the value back', async () => {
            await deliver(client, { command: 'vacuum:status', operation: DeviceCommandOperation.GetProperty });

            expect(deviceCommandService.execute).toHaveBeenCalledWith(
                expect.objectContaining({ deviceId: DEVICE_ID, command: 'vacuum:status' })
            );
            expect(client.publishAsync).toHaveBeenCalledWith(RESPONSE_TOPIC, 'sweeping', expect.anything());
        });

        it('Should ignore a message on a topic it cannot read a device id from', () => {
            client.emit('message', 'miot-bridge/device/abc/command', Buffer.from('{}'), packet());

            expect(spans()).toHaveLength(0);
        });
    });

    describe('Tracing', () => {
        it('Should raise a consumer span for the message', async () => {
            await deliver(client, { command: 'vacuum:status', operation: DeviceCommandOperation.GetProperty });

            const span = spanNamed(COMMAND_SPAN);

            expect(span.kind).toBe(SpanKind.CONSUMER);
            expect(span.attributes).toMatchObject({
                'messaging.system': 'mqtt',
                'messaging.destination.name': COMMAND_TOPIC,
                'miot.device.id': DEVICE_ID,
                'miot.command': 'vacuum:status',
                'miot.operation': DeviceCommandOperation.GetProperty
            });
        });

        // The whole point of the feature: work triggered while handling a message has to land
        // in the same trace, so a command's journey is one thing in Tempo rather than several.
        it('Should make the response publish a child of the consume span', async () => {
            await deliver(client, { command: 'vacuum:status', operation: DeviceCommandOperation.GetProperty });

            const consume = spanNamed(COMMAND_SPAN);
            const publish = spanNamed(RESPONSE_SPAN);

            expect(publish.kind).toBe(SpanKind.PRODUCER);
            expect(publish.parentSpanContext?.spanId).toBe(consume.spanContext().spanId);
            expect(publish.spanContext().traceId).toBe(consume.spanContext().traceId);
        });

        it('Should continue the trace the publisher put in the packet', async () => {
            const traceId = '0af7651916cd43dd8448eb211c80319c';

            await deliver(
                client,
                { command: 'vacuum:status', operation: DeviceCommandOperation.GetProperty },
                packet({ traceparent: `00-${traceId}-b7ad6b7169203331-01` })
            );

            expect(spanNamed(COMMAND_SPAN).spanContext().traceId).toBe(traceId);
        });

        it('Should send a traceparent out with the response', async () => {
            await deliver(client, { command: 'vacuum:status', operation: DeviceCommandOperation.GetProperty });

            const [, , options] = client.publishAsync.mock.calls[0] as unknown as [
                string,
                string,
                { properties: { userProperties: Record<string, string> } }
            ];
            const publish = spanNamed(RESPONSE_SPAN);

            expect(options.properties.userProperties['traceparent']).toContain(publish.spanContext().traceId);
        });
    });

    describe('Failures', () => {
        it('Should answer a non-JSON payload with an error and mark the span failed', async () => {
            await deliver(client, 'not json');

            expect(client.publishAsync).toHaveBeenCalledWith(
                RESPONSE_TOPIC,
                'error: Invalid JSON.',
                expect.anything()
            );
            expect(spanNamed(COMMAND_SPAN).status.code).toBe(SpanStatusCode.ERROR);
        });

        it('Should answer a payload that fails validation with an error', async () => {
            await deliver(client, { command: 'vacuum:status' });

            const [, body] = client.publishAsync.mock.calls[0] as unknown as [string, string];

            expect(body).toContain('error: Validation failed.');
            expect(spanNamed(COMMAND_SPAN).status.code).toBe(SpanStatusCode.ERROR);
        });

        it('Should answer a failed command with its message and mark the span failed', async () => {
            vi.spyOn(deviceCommandService, 'execute').mockRejectedValue(new Error('device unreachable'));

            await deliver(client, { command: 'vacuum:status', operation: DeviceCommandOperation.GetProperty });

            expect(client.publishAsync).toHaveBeenCalledWith(
                RESPONSE_TOPIC,
                'error: device unreachable',
                expect.anything()
            );
            expect(spanNamed(COMMAND_SPAN).status).toMatchObject({
                code: SpanStatusCode.ERROR,
                message: 'device unreachable'
            });
        });

        // An undeliverable response must not fail the command that produced it, but it must
        // still be visible — otherwise the only trace of it is a log line.
        it('Should mark the publish span failed without failing the consume span', async () => {
            client.publishAsync.mockRejectedValue(new Error('broker unreachable') as never);

            await deliver(client, { command: 'vacuum:status', operation: DeviceCommandOperation.GetProperty });

            expect(spanNamed(RESPONSE_SPAN).status.code).toBe(SpanStatusCode.ERROR);
            expect(spanNamed(COMMAND_SPAN).status.code).toBe(SpanStatusCode.UNSET);
        });

        it('Should not answer an empty payload', async () => {
            client.emit('message', COMMAND_TOPIC, Buffer.alloc(0), packet());
            await vi.waitUntil(() => spans().some((span) => span.name === COMMAND_SPAN));

            expect(client.publishAsync).not.toHaveBeenCalled();
        });
    });

});

// Its own container: `MqttClientProvider` resolves to null when `mqtt.enabled` is false, and
// the service has to degrade to a no-op rather than throwing the whole bootstrap.
describe('MqttListenerService with MQTT disabled', () => {
    beforeEach(() => PlatformTest.create({ imports: [{ token: MqttClientProvider, use: null }] }));
    afterEach(PlatformTest.reset);

    it('Should start without subscribing', () => {
        expect(() => PlatformTest.get<MqttListenerService>(MqttListenerService).$onInit()).not.toThrow();
    });
});
