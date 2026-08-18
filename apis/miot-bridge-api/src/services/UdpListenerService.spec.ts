import { createSocket, type Socket } from 'dgram';
import { PlatformTest } from '@tsed/platform-http/testing';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
    InMemorySpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
    type ReadableSpan
} from '@opentelemetry/sdk-trace-node';
import { CommonUtils } from '@radoslavirha/utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { SPAN_UDP_COMMAND } from '../otel/telemetry.js';
import { ConfigService } from './ConfigService.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { UdpListenerService } from './UdpListenerService.js';

const DEVICE_ID = 442;
const COMMAND = 'vacuum:status';

/** Stands in for an auto-instrumentation raised while the command runs. */
const DOWNSTREAM_SPAN = 'mongodb.findOne';

const exporter = new InMemorySpanExporter();

const spans = (): ReadableSpan[] => exporter.getFinishedSpans();

const spanNamed = (name: string): ReadableSpan => {
    const span = spans().find((candidate) => candidate.name === name);
    if (span === undefined) {
        throw new Error(`No span named "${name}". Got: ${spans().map((s) => s.name).join(', ')}`);
    }
    return span;
};

const commandResponse = (): CommandResponseModel =>
    CommonUtils.buildModelStrict(CommandResponseModel, {
        deviceId: DEVICE_ID,
        command: COMMAND,
        operation: DeviceCommandOperation.GetProperty,
        success: true,
        value: 'sweeping'
    });

describe('UdpListenerService', () => {
    // A real socket, because the socket *is* the entry point under test — a datagram arriving is
    // what has to root a trace, and driving the private handler instead would not prove it.
    const port = 45_000 + Math.floor(Math.random() * 2_000);

    let listener: UdpListenerService;
    let deviceCommandService: DeviceCommandService;
    let client: Socket;

    beforeAll(() => {
        new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();
    });

    afterAll(() => {
        trace.disable();
    });

    beforeEach(async () => {
        exporter.reset();
        await PlatformTest.create();

        const configService = PlatformTest.get<ConfigService>(ConfigService);
        vi.spyOn(configService, 'config', 'get').mockReturnValue({
            ...configService.config,
            udp: { enabled: true, port }
        } as typeof configService.config);

        deviceCommandService = PlatformTest.get<DeviceCommandService>(DeviceCommandService);
        vi.spyOn(deviceCommandService, 'execute').mockResolvedValue(commandResponse());

        listener = PlatformTest.get<UdpListenerService>(UdpListenerService);
        await listener.$onInit();

        client = createSocket('udp4');
    });

    afterEach(async () => {
        client.close();
        await listener.$onDestroy();
        PlatformTest.reset();
        vi.restoreAllMocks();
    });

    /** Sends one datagram and resolves with the reply the listener sends back. */
    const send = (body: unknown): Promise<string> =>
        new Promise<string>((resolve, reject) => {
            client.once('message', (reply) => resolve(reply.toString('utf8')));
            client.once('error', reject);
            client.send(typeof body === 'string' ? body : JSON.stringify(body), port, '127.0.0.1', (error) => {
                if (CommonUtils.notNil(error)) reject(error);
            });
        });

    const command = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
        deviceId: DEVICE_ID,
        command: COMMAND,
        operation: DeviceCommandOperation.GetProperty,
        ...overrides
    });

    describe('Command handling', () => {
        it('Should execute the command and reply with its value', async () => {
            await expect(send(command())).resolves.toBe('sweeping');

            expect(deviceCommandService.execute).toHaveBeenCalledWith(
                expect.objectContaining({ deviceId: DEVICE_ID, command: COMMAND })
            );
        });

        it('Should reply with an empty body for an action', async () => {
            vi.spyOn(deviceCommandService, 'execute').mockResolvedValue(
                CommonUtils.buildModelStrict(CommandResponseModel, {
                    deviceId: DEVICE_ID,
                    command: 'vacuum:start-sweep',
                    operation: DeviceCommandOperation.Action,
                    success: true
                })
            );

            await expect(send(command({ command: 'vacuum:start-sweep', operation: DeviceCommandOperation.Action }))).resolves.toBe('');
        });
    });

    describe('Tracing', () => {
        it('Should root a CONSUMER span carrying both ends of the datagram', async () => {
            await send(command());
            await vi.waitUntil(() => spans().length > 0);

            const span = spanNamed(SPAN_UDP_COMMAND);

            expect(span.kind).toBe(SpanKind.CONSUMER);
            expect(span.parentSpanContext).toBeUndefined();
            expect(span.attributes).toMatchObject({
                'network.transport': 'udp',
                'network.peer.address': '127.0.0.1',
                'network.local.port': port,
                'miot.device.id': String(DEVICE_ID),
                'miot.command': COMMAND,
                'miot.operation': DeviceCommandOperation.GetProperty
            });
            expect(span.attributes['network.peer.port']).toEqual(expect.any(Number));
        });

        // The point of wrapping the whole handler: a command arriving over UDP is one trace,
        // not a reply plus a scattering of parentless Mongo spans.
        it('Should make work done handling the datagram a child of the span', async () => {
            vi.spyOn(deviceCommandService, 'execute').mockImplementation(async () => {
                trace.getTracer('mongoose').startSpan(DOWNSTREAM_SPAN).end();
                return commandResponse();
            });

            await send(command());
            await vi.waitUntil(() => spans().length >= 2);

            expect(spanNamed(DOWNSTREAM_SPAN).parentSpanContext?.spanId).toBe(
                spanNamed(SPAN_UDP_COMMAND).spanContext().spanId
            );
        });
    });

    describe('Failures', () => {
        it('Should answer a non-JSON datagram with an error and mark the span failed', async () => {
            await expect(send('not json')).resolves.toBe('error: Invalid JSON.');
            await vi.waitUntil(() => spans().length > 0);

            expect(spanNamed(SPAN_UDP_COMMAND).status).toMatchObject({
                code: SpanStatusCode.ERROR,
                message: 'Invalid JSON.'
            });
        });

        it('Should answer a datagram that fails validation with an error', async () => {
            const reply = await send({ deviceId: DEVICE_ID });
            await vi.waitUntil(() => spans().length > 0);

            expect(reply).toContain('error: Validation failed.');
            expect(spanNamed(SPAN_UDP_COMMAND).status.code).toBe(SpanStatusCode.ERROR);
        });

        it('Should answer a failed command with its message and mark the span failed', async () => {
            vi.spyOn(deviceCommandService, 'execute').mockRejectedValue(new Error('device unreachable'));

            await expect(send(command())).resolves.toBe('error: device unreachable');
            await vi.waitUntil(() => spans().length > 0);

            expect(spanNamed(SPAN_UDP_COMMAND).status).toMatchObject({
                code: SpanStatusCode.ERROR,
                message: 'device unreachable'
            });
        });
    });
});

// Its own container: with `udp.enabled` false the listener must bind nothing rather than throw.
describe('UdpListenerService with UDP disabled', () => {
    beforeEach(() => PlatformTest.create());
    afterEach(PlatformTest.reset);

    it('Should start without binding a socket', async () => {
        await expect(PlatformTest.get<UdpListenerService>(UdpListenerService).$onInit()).resolves.toBeUndefined();
    });
});
