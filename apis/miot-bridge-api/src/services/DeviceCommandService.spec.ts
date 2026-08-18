import { PlatformTest } from '@tsed/platform-http/testing';
import { metrics, SpanKind, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import {
    MeterProvider,
    MetricReader,
    type DataPoint,
    type Histogram as HistogramValue,
    type MetricData
} from '@opentelemetry/sdk-metrics';
import {
    InMemorySpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
    type ReadableSpan
} from '@opentelemetry/sdk-trace-node';
import {
    MiotError,
    MIOT_DEFAULT_PORT,
    MIOT_ERROR_DEVICE_ERROR,
    MIOT_ERROR_TIMEOUT,
    MIOT_METHOD_GET_PROPERTIES,
    type GetPropertiesResult,
    type MiotDevice
} from '@radoslavirha/miot-device';
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
import {
    METRIC_MIOT_CLIENT_CALL_DURATION,
    METRIC_MIOT_PROPERTY_REJECTIONS,
    MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE,
    MIOT_PROPERTY_SOURCE_VALUE_SPEC,
    SPAN_MIOT_ACTION,
    SPAN_MIOT_GET_PROPERTIES,
    SPAN_MIOT_SET_PROPERTIES
} from '../otel/telemetry.js';
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

/** Collects on demand, with none of the timers a `PeriodicExportingMetricReader` would start. */
class OnDemandMetricReader extends MetricReader {
    protected onForceFlush(): Promise<void> {
        return Promise.resolve();
    }

    protected onShutdown(): Promise<void> {
        return Promise.resolve();
    }
}

let reader: OnDemandMetricReader;

const collect = async (name: string): Promise<MetricData | undefined> => {
    const { resourceMetrics } = await reader.collect();

    return resourceMetrics.scopeMetrics
        .flatMap((scope) => scope.metrics)
        .find((metric) => metric.descriptor.name === name);
};

const point = async (name: string, attributes: Attributes): Promise<DataPoint<unknown> | undefined> =>
    (await collect(name))?.dataPoints.find((candidate) =>
        Object.entries(attributes).every(([key, value]) => candidate.attributes[key] === value)
    );

const calls = async (attributes: Attributes): Promise<number> => {
    const match = await point(METRIC_MIOT_CLIENT_CALL_DURATION, attributes);

    return (match?.value as HistogramValue | undefined)?.count ?? 0;
};

const rejections = async (attributes: Attributes): Promise<number> => {
    const match = await point(METRIC_MIOT_PROPERTY_REJECTIONS, attributes);

    return (match?.value as number | undefined) ?? 0;
};

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
                    source: MIOT_PROPERTY_SOURCE_VALUE_SPEC,
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
    public readonly getProperties = vi.fn(
        async (): Promise<GetPropertiesResult[]> => [{ siid: 2, piid: 1, value: 'sweeping', code: 0 }]
    );
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
        // A fresh provider per test: cumulative counters never go back down, so a shared one would
        // leak every previous test's increments into this one.
        reader = new OnDemandMetricReader();
        metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
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
    afterEach(async () => {
        await reader.shutdown();
        metrics.disable();
    });

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
            'miot.device.id': String(DEVICE_ID),
            'miot.siid': '2',
            'miot.piid': '1',
            'miot.command': PROPERTY_KEY
        });
    });

    it('Should raise a CLIENT span for a property write', async () => {
        await service.execute(request({ operation: DeviceCommandOperation.SetProperty, value: 1 }));

        expect(miotDevice.setProperty).toHaveBeenCalledWith(2, 1, 1);
        expect(spanNamed(SPAN_MIOT_SET_PROPERTIES).attributes).toMatchObject({ 'miot.piid': '1' });
    });

    it('Should raise a CLIENT span for an action', async () => {
        await service.execute(request({ command: ACTION_KEY, operation: DeviceCommandOperation.Action }));

        expect(spanNamed(SPAN_MIOT_ACTION).attributes).toMatchObject({ 'miot.aiid': '1', 'miot.command': ACTION_KEY });
    });

    it('Should raise a CLIENT span carrying the property count for a bulk read', async () => {
        await service.getProperties(STORAGE_ID, [PROPERTY_KEY]);

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).attributes).toMatchObject({ 'miot.property.count': 1 });
    });

    // Pins the *types*, which is the whole rule: `miot.*` has no semantic convention, so nothing
    // outside this repo stops an identifier being emitted as an integer again. Tempo exports one
    // as `intValue`, and a Grafana table panel running `select(span.miot.device.id, …)` then dies
    // on the sparse numeric column it builds — `miot.device.id` is on `poll device` but not on the
    // mongoose spans beside it. Nothing here is arithmetic; the counts and ports beside them are.
    it('Should emit identifiers as strings and quantities as numbers', async () => {
        await service.execute(request());

        const { attributes } = spanNamed(SPAN_MIOT_GET_PROPERTIES);

        expect(typeof attributes['miot.device.id']).toBe('string');
        expect(typeof attributes['miot.siid']).toBe('string');
        expect(typeof attributes['miot.piid']).toBe('string');
        expect(typeof attributes['server.port']).toBe('number');
    });

    it('Should mark the span failed when the device does not answer', async () => {
        miotDevice.getProperty.mockRejectedValue(new MiotError('Command timeout: no response from 192.168.1.42:54321', {
            kind: MIOT_ERROR_TIMEOUT,
            method: MIOT_METHOD_GET_PROPERTIES
        }));

        await expect(service.execute(request())).rejects.toThrow('Command timeout');

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).status).toMatchObject({
            code: SpanStatusCode.ERROR,
            message: 'Command timeout: no response from 192.168.1.42:54321'
        });
    });

    // The RPC conventions fit miIO exactly — it is JSON-RPC over UDP — so none of this is invented.
    // `rpc.system` and `rpc.service` are deprecated and deliberately absent.
    it('Should describe the call with the RPC semantic conventions', async () => {
        await service.execute(request());

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).attributes).toMatchObject({
            'rpc.system.name': 'jsonrpc',
            'rpc.method': 'get_properties'
        });
    });

    // Silence and refusal are different answers and must not collapse into one. A timeout has no
    // code to report; asserting its absence is what stops a future change inventing one.
    it('Should classify a timeout as error.type=timeout with no status code', async () => {
        miotDevice.getProperty.mockRejectedValue(new MiotError('Command timeout', {
            kind: MIOT_ERROR_TIMEOUT,
            method: MIOT_METHOD_GET_PROPERTIES
        }));

        await expect(service.execute(request())).rejects.toThrow('Command timeout');

        const { attributes } = spanNamed(SPAN_MIOT_GET_PROPERTIES);

        expect(attributes['error.type']).toBe('timeout');
        expect(attributes['rpc.response.status_code']).toBeUndefined();
        expect(await calls({ 'rpc.method': 'get_properties', 'error.type': 'timeout' })).toBe(1);
    });

    // The whole point of the exercise: the device refused, and the code plus the provenance say
    // whether the entry we asked for is theirs or ours. The code is a *string* — semconv requires
    // it, and a sparse numeric span attribute is what crashed the Grafana table panel.
    it('Should carry the device error code and the property provenance on a refusal', async () => {
        miotDevice.getProperty.mockRejectedValue(new MiotError('Device error -4004: property not exist', {
            kind: MIOT_ERROR_DEVICE_ERROR,
            method: MIOT_METHOD_GET_PROPERTIES,
            code: -4004
        }));

        await expect(service.execute(request())).rejects.toThrow('Device error');

        const { attributes, status } = spanNamed(SPAN_MIOT_GET_PROPERTIES);

        expect(attributes['error.type']).toBe('device_error');
        expect(attributes['rpc.response.status_code']).toBe('-4004');
        expect(typeof attributes['rpc.response.status_code']).toBe('string');
        expect(attributes['miot.property.source']).toBe(MIOT_PROPERTY_SOURCE_VALUE_SPEC);
        // `rpc.jsonrpc.error_message` is deprecated in favour of the status description.
        expect(status).toMatchObject({ code: SpanStatusCode.ERROR, message: 'Device error -4004: property not exist' });

        expect(await rejections({
            'rpc.method': 'get_properties',
            'rpc.response.status_code': '-4004',
            'miot.property.source': MIOT_PROPERTY_SOURCE_VALUE_SPEC
        })).toBe(1);
    });

    it('Should record a successful call with no error.type', async () => {
        await service.execute(request());

        expect(await calls({ 'rpc.method': 'get_properties' })).toBe(1);
        const match = await point(METRIC_MIOT_CLIENT_CALL_DURATION, { 'rpc.method': 'get_properties' });
        expect(match?.attributes['error.type']).toBeUndefined();
    });

    // The blackbox answer. An override is an entry we added because the published spec lacks it,
    // so a refusal of one blames us rather than Xiaomi — and nothing else in the system can tell
    // the two apart once the mapper has merged them into one map.
    it('Should attribute a refusal to the override when the property came from one', async () => {
        const overridden = spec();
        overridden.properties.set(PROPERTY_KEY, CommonUtils.buildModelStrict(MiotProperty, {
            source: MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE,
            siid: 2,
            piid: 9,
            access: [PropertyAccess.Read],
            values: []
        }));
        vi.spyOn(PlatformTest.get<SimplifiedMiotSpecV2Mapper>(SimplifiedMiotSpecV2Mapper), 'map').mockResolvedValue(overridden);
        miotDevice.getProperty.mockRejectedValue(new MiotError('Device error -4004: property not exist', {
            kind: MIOT_ERROR_DEVICE_ERROR,
            method: MIOT_METHOD_GET_PROPERTIES,
            code: -4004
        }));

        await expect(service.execute(request())).rejects.toThrow('Device error');

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).attributes['miot.property.source'])
            .toBe(MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE);
        expect(await rejections({
            'rpc.response.status_code': '-4004',
            'miot.property.source': MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE
        })).toBe(1);
    });

    // The shape that made these invisible: the RPC call succeeds, and the refusals are per-item
    // codes inside its result. Nothing about the call is failed, so only this reports them.
    it('Should report per-property refusals inside a successful bulk read', async () => {
        miotDevice.getProperties.mockResolvedValue([{ siid: 2, piid: 1, code: -4004 }]);

        const { results } = await service.getProperties(STORAGE_ID, [PROPERTY_KEY]);

        expect(results[0].code).toBe(-4004);
        expect(results[0].source).toBe(MIOT_PROPERTY_SOURCE_VALUE_SPEC);

        const { attributes } = spanNamed(SPAN_MIOT_GET_PROPERTIES);
        expect(attributes['miot.property.rejected']).toEqual([PROPERTY_KEY]);
        expect(attributes['miot.property.rejected.count']).toBe(1);
        // The call itself succeeded — that is exactly why the counter is needed.
        expect(attributes['error.type']).toBeUndefined();

        expect(await rejections({ 'rpc.response.status_code': '-4004' })).toBe(1);
        expect(await calls({ 'rpc.method': 'get_properties' })).toBe(1);
    });

    // A device that silently drops an unknown siid/piid answers the same question a -4004 does,
    // but the `-1` filler is ours, not the device's, and must not masquerade as a miIO code.
    it('Should mark a property the device omitted entirely as _MISSING', async () => {
        miotDevice.getProperties.mockResolvedValue([]);

        await service.getProperties(STORAGE_ID, [PROPERTY_KEY]);

        expect(await rejections({ 'rpc.response.status_code': '_MISSING' })).toBe(1);
    });

    // No span exists for this — the packet was never sent — so the metric is the only always-on
    // evidence that Loxone is asking for a key this service cannot resolve.
    it('Should record a locally rejected command on the metric despite raising no span', async () => {
        await expect(service.execute(request({ command: 'vacuum:missing' }))).rejects.toThrow('not found in spec');

        expect(spans()).toHaveLength(0);
        expect(await calls({ 'rpc.method': 'get_properties', 'error.type': 'rejected_locally' })).toBe(1);
    });

    // A Mongo fault or a programming error on this path is not a device fault. Labelling it one
    // would put our bugs in the device's column, so it gets semconv's own `_OTHER` fallback.
    it('Should not blame the device for an unclassified failure', async () => {
        miotDevice.getProperty.mockRejectedValue(new Error('connection to mongo lost'));

        await expect(service.execute(request())).rejects.toThrow('connection to mongo lost');

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).attributes['error.type']).toBe('_OTHER');
        expect(await calls({ 'rpc.method': 'get_properties', 'error.type': '_OTHER' })).toBe(1);
        expect(await rejections({ 'miot.property.source': MIOT_PROPERTY_SOURCE_VALUE_SPEC })).toBe(0);
    });

    // Orthogonal to the failure class on purpose: a stamp-refreshed failure is still a timeout or
    // a device error, and promoting it to a peer member would erase the code.
    it('Should flag a failure that survived a stamp refresh without changing its class', async () => {
        miotDevice.getProperty.mockRejectedValue(MiotError.afterStampRefresh(
            new MiotError('Device error -4004: property not exist', {
                kind: MIOT_ERROR_DEVICE_ERROR,
                method: MIOT_METHOD_GET_PROPERTIES,
                code: -4004
            }),
            MIOT_METHOD_GET_PROPERTIES,
            DEVICE_ID
        ));

        await expect(service.execute(request())).rejects.toThrow('after stamp refresh');

        const { attributes } = spanNamed(SPAN_MIOT_GET_PROPERTIES);
        expect(attributes['miot.stamp.refreshed']).toBe(true);
        expect(attributes['error.type']).toBe('device_error');
        expect(attributes['rpc.response.status_code']).toBe('-4004');
    });

    it('Should raise a CLIENT span for a raw IID command, bypassing the spec', async () => {
        await service.executeRaw({ deviceId: DEVICE_ID, operation: DeviceCommandOperation.GetProperty, siid: 9, piid: 8 } as never);

        expect(spanNamed(SPAN_MIOT_GET_PROPERTIES).attributes).toMatchObject({ 'miot.siid': '9', 'miot.piid': '8' });
    });

    // A spec violation is rejected before the device is addressed, so there must be no client
    // span at all — a span for a call that never left the process is a lie.
    it('Should raise no span when the command fails validation', async () => {
        await expect(service.execute(request({ command: 'vacuum:missing' }))).rejects.toThrow('not found in spec');

        expect(spans()).toHaveLength(0);
    });
});
