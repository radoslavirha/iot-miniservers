import { diag } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OTELConfig } from './OtelConfig.js';

const mocks = vi.hoisted(() => ({
    start: vi.fn(),
    sdkShutdown: vi.fn<() => Promise<void>>(),
    NodeSDK: vi.fn(),
    HttpInstrumentation: vi.fn(),
    ExpressInstrumentation: vi.fn(),
    WinstonInstrumentation: vi.fn()
}));

vi.mock('@opentelemetry/sdk-node', () => ({
    NodeSDK: mocks.NodeSDK
}));

// Constructing a real instrumentation with `enabled: true` patches the module registry for
// the whole test process. These are mocked so the config the service builds can be asserted
// without that side effect.
vi.mock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: mocks.HttpInstrumentation }));
vi.mock('@opentelemetry/instrumentation-express', () => ({ ExpressInstrumentation: mocks.ExpressInstrumentation }));
vi.mock('@opentelemetry/instrumentation-winston', () => ({ WinstonInstrumentation: mocks.WinstonInstrumentation }));

// `registerInstrumentationHook` installs a real ESM loader hook for the whole process.
// Harmless in an app, gratuitous in a unit test.
vi.mock('node:module', () => ({ register: vi.fn() }));

const { DEFAULT_OTEL_SHUTDOWN_MS, OpenTelemetryService, openTelemetry } = await import('./OpenTelemetryService.js');

const exporter = { url: 'http://localhost:4318' };

const CONFIG: OTELConfig = { metrics: { enabled: true, exporter } };

const OPTIONS = { otel: CONFIG, service: 'test-api', version: '1.0.0' };

/** The options the service handed to `NodeSDK`. */
const sdkOptions = (): Record<string, unknown> => mocks.NodeSDK.mock.calls[0][0] as Record<string, unknown>;

describe('OpenTelemetryService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sdkShutdown.mockResolvedValue(undefined);
        // A regular function, not an arrow: the service calls `new NodeSDK(...)`.
        mocks.NodeSDK.mockImplementation(function () {
            return { start: mocks.start, shutdown: mocks.sdkShutdown };
        });
    });

    // `diag.setLogger` is global; leaving it set would make every later test log at DEBUG.
    afterEach(() => diag.disable());

    describe('init', () => {
        it('Should start the SDK when a signal is enabled', () => {
            new OpenTelemetryService().init(OPTIONS);

            expect(mocks.start).toHaveBeenCalledOnce();
        });

        it('Should not start the SDK when there is no config', () => {
            new OpenTelemetryService().init({ ...OPTIONS, otel: undefined });

            expect(mocks.NodeSDK).not.toHaveBeenCalled();
        });

        it('Should not start the SDK when every signal is disabled', () => {
            new OpenTelemetryService().init({
                ...OPTIONS,
                otel: { traces: { enabled: false }, metrics: { enabled: false }, logs: { enabled: false } }
            });

            expect(mocks.NodeSDK).not.toHaveBeenCalled();
        });

        it('Should start the SDK for logs alone', () => {
            new OpenTelemetryService().init({ ...OPTIONS, otel: { logs: { enabled: true, exporter } } });

            expect(mocks.start).toHaveBeenCalledOnce();
        });

        it('Should wire only the signals that are enabled', () => {
            new OpenTelemetryService().init({
                ...OPTIONS,
                otel: {
                    debug: true,
                    traces: { enabled: true, exporter },
                    logs: { enabled: true, exporter }
                }
            });

            const options = sdkOptions();

            expect(options.traceExporter).toBeDefined();
            expect(options.logRecordProcessors).toHaveLength(1);
            // Metrics were left out of the config, so the reader list must be absent
            // rather than empty — NodeSDK treats the two differently.
            expect(options.metricReaders).toBeUndefined();
        });

        // The long comment on `ignoreIncomingRequestHook` explains why probes are dropped;
        // this is the assertion that the wiring actually does it.
        it('Should ignore probe paths but not application routes', () => {
            new OpenTelemetryService().init({ ...OPTIONS, otel: { traces: { enabled: true, exporter } } });

            const { ignoreIncomingRequestHook } = mocks.HttpInstrumentation.mock.calls[0][0] as {
                ignoreIncomingRequestHook: (request: { url: string }) => boolean;
            };

            expect(ignoreIncomingRequestHook({ url: '/health/ready' })).toBe(true);
            expect(ignoreIncomingRequestHook({ url: '/healthz' })).toBe(true);
            expect(ignoreIncomingRequestHook({ url: '/api/v1/qr' })).toBe(false);
        });

        it('Should start one SDK however many times it is initialised', () => {
            const service = new OpenTelemetryService();

            service.init(OPTIONS);
            service.init(OPTIONS);

            expect(mocks.NodeSDK).toHaveBeenCalledOnce();
        });
    });

    describe('shutdown', () => {
        // The normal local path: `pnpm start` has no `--import` hook, so no SDK exists.
        it('Should resolve without throwing when no SDK was started', async () => {
            await expect(new OpenTelemetryService().shutdown()).resolves.toBeUndefined();
            expect(mocks.sdkShutdown).not.toHaveBeenCalled();
        });

        it('Should shut the SDK down once', async () => {
            const service = new OpenTelemetryService();
            service.init(OPTIONS);

            await service.shutdown();

            expect(mocks.sdkShutdown).toHaveBeenCalledOnce();
        });

        it('Should ignore a second shutdown rather than flush twice', async () => {
            const service = new OpenTelemetryService();
            service.init(OPTIONS);

            await Promise.all([service.shutdown(), service.shutdown()]);
            await service.shutdown();

            expect(mocks.sdkShutdown).toHaveBeenCalledOnce();
        });

        // An unreachable collector makes the exporter retry. Without the race the pod
        // burns its remaining grace period and is SIGKILLed, losing more than it saves.
        it('Should give up at the timeout when the flush never settles', async () => {
            vi.useFakeTimers();
            mocks.sdkShutdown.mockReturnValue(new Promise(() => undefined));

            const service = new OpenTelemetryService();
            service.init(OPTIONS);

            const settled = vi.fn();
            const pending = service.shutdown(50).then(settled);

            await vi.advanceTimersByTimeAsync(49);
            expect(settled).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            await pending;
            expect(settled).toHaveBeenCalledOnce();

            vi.useRealTimers();
        });

        // A failed flush must not turn a clean termination into a crash.
        it('Should swallow a rejecting shutdown', async () => {
            mocks.sdkShutdown.mockRejectedValue(new Error('collector unreachable'));

            const service = new OpenTelemetryService();
            service.init(OPTIONS);

            await expect(service.shutdown()).resolves.toBeUndefined();
        });

        it('Should default the flush timeout to three seconds', () => {
            expect(DEFAULT_OTEL_SHUTDOWN_MS).toBe(3_000);
        });
    });

    // `instrument.js` and `index.js` are separate `--import` entry graphs; the shared
    // instance is the only thing connecting the SDK's start to its teardown.
    it('Should expose a single process-wide instance', () => {
        expect(openTelemetry).toBeInstanceOf(OpenTelemetryService);
    });
});
