import { PlatformTest } from '@tsed/platform-http/testing';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
    InMemorySpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
    type ReadableSpan
} from '@opentelemetry/sdk-trace-node';
import { MIOT_DEFAULT_PORT, type MiotDevice } from '@radoslavirha/miot-device';
import { CommonUtils } from '@radoslavirha/utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import type { DeviceCache } from '../models/DeviceCache.js';
import { MiotAction } from '../models/simplified-miot-spec/MiotAction.js';
import { MiotProperty } from '../models/simplified-miot-spec/MiotProperty.js';
import { MiotPropertyValue } from '../models/simplified-miot-spec/MiotPropertyValue.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';
import type { SimplifiedMiotSpec } from '../models/simplified-miot-spec/SimplifiedMiotSpec.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/SimplifiedMiotSpecV2Mapper.js';
import { SPAN_MIOT_ACTION, SPAN_MIOT_GET_PROPERTIES, SPAN_MIOT_SET_PROPERTIES } from '../otel/telemetry.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { DeviceStorageService } from './DeviceStorageService.js';
import { MiotDeviceRegistry } from './MiotDeviceRegistry.js';
import { ModelPropertyOverrideService } from './ModelPropertyOverrideService.js';

const STORAGE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DEVICE_ID = 442;
const ADDRESS = '192.168.1.42';

const PROPERTY_KEY = 'vacuum:status';
const ACTION_KEY = 'vacuum:start-sweep';

const exporter = new InMemorySpanExporter();

const spans = (): ReadableSpan[] => exporter.getFinishedSpans();

const spanNamed = (name: string): ReadableSpan => {
    const span = spans().find((candidate) => candidate.name === name);
    if (span === undefined) {
        throw new Error(`No span named "${name}". Got: ${spans().map((s) => s.name).join(', ')}`);
    }
    return span;
};

const device = (): DeviceCache =>
    ({ id: STORAGE_ID, deviceId: DEVICE_ID, address: ADDRESS, token: 'a'.repeat(32), model: 'xiaomi.vacuum.c102gl' }) as DeviceCache;

const spec = (): SimplifiedMiotSpec =>
    ({
        name: 'vacuum',
        type: 'urn:miot-spec-v2:device:vacuum',
        properties: new Map<string, MiotProperty>([
            [
                PROPERTY_KEY,
                CommonUtils.buildModelStrict(MiotProperty, {
                    siid: 2,
                    piid: 1,
                    access: [PropertyAccess.Read, PropertyAccess.Write],
                    values: [CommonUtils.buildModelStrict(MiotPropertyValue, { value: 1, description: 'sweeping' })]
                })
            ]
        ]),
        actions: new Map<string, MiotAction>([
            [ACTION_KEY, CommonUtils.buildModelStrict(MiotAction, { siid: 2, aiid: 1 })]
        ])
    }) as SimplifiedMiotSpec;

const request = (overrides: Partial<DeviceCommandRequest> = {}): DeviceCommandRequest =>
    ({
        deviceId: DEVICE_ID,
        command: PROPERTY_KEY,
        operation: DeviceCommandOperation.GetProperty,
        ...overrides
    }) as DeviceCommandRequest;

/** Only the four command methods are stubbed — the transport underneath is never reached. */
class FakeMiotDevice {
    public readonly getProperty = vi.fn(async () => 'sweeping');
    public readonly setProperty = vi.fn(async () => undefined);
    public readonly callAction = vi.fn(async () => undefined);
    public readonly getProperties = vi.fn(async () => [{ siid: 2, piid: 1, value: 'sweeping', code: 0 }]);
}

describe('DeviceCommandService', () => {
    let service: DeviceCommandService;
    let miotDevice: FakeMiotDevice;

    beforeAll(() => {
        new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();
    });

    afterAll(() => {
        trace.disable();
    });

    beforeEach(async () => {
        exporter.reset();
        await PlatformTest.create();

        miotDevice = new FakeMiotDevice();

        const storage = PlatformTest.get<DeviceStorageService>(DeviceStorageService);
        vi.spyOn(storage, 'getByDeviceId').mockResolvedValue(device());
        vi.spyOn(storage, 'getById').mockResolvedValue(device());
        vi.spyOn(PlatformTest.get<ModelPropertyOverrideService>(ModelPropertyOverrideService), 'getByModel').mockResolvedValue([]);
        vi.spyOn(PlatformTest.get<SimplifiedMiotSpecV2Mapper>(SimplifiedMiotSpecV2Mapper), 'map').mockResolvedValue(spec());
        vi.spyOn(PlatformTest.get<MiotDeviceRegistry>(MiotDeviceRegistry), 'getOrCreate').mockReturnValue(
            miotDevice as unknown as MiotDevice
        );

        service = PlatformTest.get<DeviceCommandService>(DeviceCommandService);
    });

    afterEach(PlatformTest.reset);
    afterEach(() => vi.restoreAllMocks());

    // The span the timeouts were invisible without: `@radoslavirha/miot-device` carries no OTel
    // dependency, so this seam is the only place that still knows which device is addressed.
    it('Should raise a CLIENT span naming the device and port for a property read', async () => {
        await service.execute(request());

        const span = spanNamed(SPAN_MIOT_GET_PROPERTIES);

        expect(span.kind).toBe(SpanKind.CLIENT);
        expect(span.attributes).toMatchObject({
            'network.transport': 'udp',
            'server.address': ADDRESS,
            'server.port': MIOT_DEFAULT_PORT,
            'miot.device.id': DEVICE_ID,
            'miot.siid': 2,
            'miot.piid': 1,
            'miot.command': PROPERTY_KEY
        });
    });

    it('Should raise a CLIENT span for a property write', async () => {
        await service.execute(request({ operation: DeviceCommandOperation.SetProperty, value: 1 }));

        expect(miotDevice.setProperty).toHaveBeenCalledWith(2, 1, 1);
        expect(spanNamed(SPAN_MIOT_SET_PROPERTIES).attributes).toMatchObject({ 'miot.piid': 1 });
    });

    it('Should raise a CLIENT span for an action', async () => {
        await service.execute(request({ command: ACTION_KEY, operation: DeviceCommandOperation.Action }));

        expect(spanNamed(SPAN_MIOT_ACTION).attributes).toMatchObject({ 'miot.aiid': 1, 'miot.command': ACTION_KEY });
    });

    it('Should raise a CLIENT span carrying the property count for a bulk read', async () => {
        await service.getProperties(STORAGE_ID, [PROPERTY_KEY]);

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).attributes).toMatchObject({ 'miot.property.count': 1 });
    });

    it('Should mark the span failed when the device does not answer', async () => {
        miotDevice.getProperty.mockRejectedValue(new Error('Command timeout: no response from 192.168.1.42:54321'));

        await expect(service.execute(request())).rejects.toThrow('Command timeout');

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).status).toMatchObject({
            code: SpanStatusCode.ERROR,
            message: 'Command timeout: no response from 192.168.1.42:54321'
        });
    });

    it('Should raise a CLIENT span for a raw IID command, bypassing the spec', async () => {
        await service.executeRaw({ deviceId: DEVICE_ID, operation: DeviceCommandOperation.GetProperty, siid: 9, piid: 8 } as never);

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).attributes).toMatchObject({ 'miot.siid': 9, 'miot.piid': 8 });
    });

    // A spec violation is rejected before the device is addressed, so there must be no client
    // span at all — a span for a call that never left the process is a lie.
    it('Should raise no span when the command fails validation', async () => {
        await expect(service.execute(request({ command: 'vacuum:missing' }))).rejects.toThrow('not found in spec');

        expect(spans()).toHaveLength(0);
    });
});
