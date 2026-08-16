import { EventEmitter } from 'events';
import { PlatformTest } from '@tsed/platform-http/testing';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
    InMemorySpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
    type ReadableSpan
} from '@opentelemetry/sdk-trace-node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropertyChangeEvent } from '../models/PropertyChangeEvent.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { ConfigService } from './ConfigService.js';
import { NotificationDispatchService } from './NotificationDispatchService.js';

const DEVICE_ID = 442;
const NOTIFICATIONS_TOPIC = `miot-bridge/device/${DEVICE_ID}/notifications`;
const NOTIFICATION_SPAN = 'publish miot-bridge/device/{deviceId}/notifications';

class FakeMqttClient extends EventEmitter {
    public readonly publishAsync = vi.fn(async () => undefined);
    public readonly endAsync = vi.fn(async () => undefined);
}

const exporter = new InMemorySpanExporter();

const spans = (): ReadableSpan[] => exporter.getFinishedSpans();

const event = (): PropertyChangeEvent => ({
    deviceId: 'device-storage-id',
    miotDeviceId: DEVICE_ID,
    property: 'vacuum:status',
    oldValue: 'idle',
    newValue: 'sweeping',
    timestamp: Date.now()
});

describe('NotificationDispatchService', () => {
    let client: FakeMqttClient;
    let service: NotificationDispatchService;

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

        // `config/test.json` has MQTT off; the dispatch path is what is under test here, so it
        // is switched on without touching a broker — the client above is a stub.
        const configService = PlatformTest.get<ConfigService>(ConfigService);
        vi.spyOn(configService, 'config', 'get').mockReturnValue({
            ...configService.config,
            mqtt: { enabled: true, url: 'mqtt://server.home:1883', clientId: 'miot-bridge', notifications: { enabled: true } }
        } as typeof configService.config);

        service = PlatformTest.get<NotificationDispatchService>(NotificationDispatchService);
    });

    afterEach(PlatformTest.reset);
    afterEach(() => vi.restoreAllMocks());

    it('Should publish the property change to the notifications topic', async () => {
        service.receive(event());
        await vi.waitUntil(() => client.publishAsync.mock.calls.length > 0);

        expect(client.publishAsync).toHaveBeenCalledWith(
            NOTIFICATIONS_TOPIC,
            JSON.stringify({ 'vacuum:status': 'sweeping' }),
            expect.anything()
        );
    });

    it('Should raise a producer span carrying the broker identity', async () => {
        service.receive(event());
        await vi.waitUntil(() => spans().length > 0);

        const [span] = spans();

        expect(span.name).toBe(NOTIFICATION_SPAN);
        expect(span.kind).toBe(SpanKind.PRODUCER);
        expect(span.attributes).toMatchObject({
            'messaging.system': 'mqtt',
            'messaging.destination.name': NOTIFICATIONS_TOPIC,
            'messaging.client.id': 'miot-bridge',
            'server.address': 'server.home',
            'server.port': 1883,
            'miot.device.id': DEVICE_ID,
            'miot.property': 'vacuum:status'
        });
    });

    // The fan-out is best-effort across three transports; a dead broker must not take the
    // others down with it, but it must still be visible as a failed span.
    it('Should mark the span failed without rejecting when the broker refuses', async () => {
        client.publishAsync.mockRejectedValue(new Error('broker unreachable') as never);

        expect(() => service.receive(event())).not.toThrow();
        await vi.waitUntil(() => spans().length > 0);

        expect(spans()[0].status).toMatchObject({ code: SpanStatusCode.ERROR, message: 'broker unreachable' });
    });

    it('Should build the payload with a null for a missing value', async () => {
        service.receive({ ...event(), newValue: undefined } as PropertyChangeEvent);
        await vi.waitUntil(() => client.publishAsync.mock.calls.length > 0);

        const [, body] = client.publishAsync.mock.calls[0] as unknown as [string, string];

        expect(body).toBe(JSON.stringify({ 'vacuum:status': null }));
    });

    it('Should not publish when MQTT notifications are switched off', () => {
        const configService = PlatformTest.get<ConfigService>(ConfigService);
        vi.spyOn(configService, 'config', 'get').mockReturnValue({
            ...configService.config,
            mqtt: { enabled: true, url: 'mqtt://server.home:1883', notifications: { enabled: false } }
        } as typeof configService.config);

        service.receive(event());

        expect(client.publishAsync).not.toHaveBeenCalled();
    });
});
