import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, type LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { type SpanExporter } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { isIgnoredTracePath } from './ignoredPaths.js';
import type { OTELConfig, OTELLogsConfig, OTELMetricsConfig, OTELTracesConfig } from './OtelConfig.js';
import { register } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

export interface OtelBootstrapOptions {
    readonly otel?: OTELConfig;
    readonly service: string;
    readonly version: string;
    readonly extraInstrumentations?: Instrumentation[];
}

/**
 * How long `shutdown()` waits for the final flush.
 *
 * Counts against the pod's termination budget: keep
 * `preStop + drainDelayMs + teardown + this` inside `terminationGracePeriodSeconds`.
 */
export const DEFAULT_OTEL_SHUTDOWN_MS = 3_000;

export class OpenTelemetryService {
    private sdk: NodeSDK | undefined;

    public init(options: OtelBootstrapOptions): void {
        const { otel, service, version, extraInstrumentations = [] } = options;

        // Idempotent by instance. This deliberately does *not* address the CJS and ESM
        // builds both being loaded — each copy would get its own class and its own field,
        // so no instance check can see the other. That needs process-global state, and
        // nothing here loads the CJS copy: every app is `"type": "module"` with a single
        // `--import` entry, and `@opentelemetry/api` refuses duplicate global registration
        // anyway.
        if (this.sdk) {
            return;
        }

        if (!this.isEnabled(otel)) {
            return;
        }

        this.initDebug(otel);
        this.registerInstrumentationHook();
        this.initSDK(otel, service, version, extraInstrumentations);
    }

    /**
     * Flushes and stops the SDK started by `init()`.
     *
     * Must run *after* the platform has stopped, never from a signal handler registered
     * inside this class: `--import instrument.js` is evaluated before the app entrypoint,
     * so a listener registered here would always fire first and tear down instrumentation
     * for the whole drain — the window it exists to preserve.
     *
     * No-op when no SDK is running. That is the normal local path: `pnpm start` runs
     * `nodemon src/index.ts` with no `--import` hook, and tests never bootstrap one.
     *
     * Time-boxed because the OTLP exporters retry. Against an unreachable collector —
     * exactly the case when a whole cluster is being disrupted — an unbounded flush burns
     * the rest of `terminationGracePeriodSeconds` and earns a SIGKILL, losing more than
     * giving up early does. Errors are swallowed: a failed flush must not turn a clean
     * termination into a crash.
     */
    public async shutdown(timeoutMs = DEFAULT_OTEL_SHUTDOWN_MS): Promise<void> {
        const sdk = this.sdk;

        if (!sdk) {
            return;
        }

        // Cleared before awaiting, so a concurrent second call is a no-op rather than a
        // second `sdk.shutdown()` over a half-flushed pipeline.
        this.sdk = undefined;

        await Promise.race([sdk.shutdown(), delay(timeoutMs)]).catch(() => undefined);
    }

    private initSDK(
        config: OTELConfig,
        serviceName: string,
        serviceVersion: string,
        extraInstrumentations: Instrumentation[]
    ): void {
        const tracesEnabled = ObjectUtils.isEnabled(config.traces);
        const logsEnabled = ObjectUtils.isEnabled(config.logs);

        const sdk = new NodeSDK({
            resource: resourceFromAttributes({
                [ATTR_SERVICE_NAME]: serviceName,
                [ATTR_SERVICE_VERSION]: serviceVersion
            }),
            traceExporter: this.getTraceExporter(config.traces),
            metricReaders: this.getMetricReaders(config.metrics),
            logRecordProcessors: this.getLoggerProcessors(config.logs),
            instrumentations: [
                new HttpInstrumentation({
                    enabled: tracesEnabled,
                    // One hook covers the whole trace: the ignore branch wraps the handler
                    // in `context.with(suppressTracing(...))`, and the SDK's tracer returns
                    // a non-recording span under suppression — so the Express child spans
                    // are dropped along with the root. No Express filter or sampler needed.
                    //
                    // This also drops `http.server.request.duration` for these paths, which
                    // is wanted: probe traffic is fast and constant-rate, and leaving it in
                    // dilutes every percentile of the real-traffic latency histogram. Probe
                    // *state* is a Kubernetes-layer fact and belongs to kube-state-metrics.
                    ignoreIncomingRequestHook: (request) => isIgnoredTracePath(request.url)
                }),
                new ExpressInstrumentation({ enabled: tracesEnabled }),
                new WinstonInstrumentation({
                    enabled: tracesEnabled,
                    disableLogSending: !logsEnabled
                }),
                ...extraInstrumentations
            ]
        });

        sdk.start();
        this.sdk = sdk;
    }

    private getMetricReaders(config?: OTELMetricsConfig): PeriodicExportingMetricReader[] | undefined {
        if (!ObjectUtils.isEnabled(config)) {
            return undefined;
        }

        return [
            new PeriodicExportingMetricReader({
                exporter: new OTLPMetricExporter({ url: config.exporter.url, headers: {} })
            })
        ];
    }

    private getTraceExporter(config?: OTELTracesConfig): SpanExporter | undefined {
        if (!ObjectUtils.isEnabled(config)) {
            return undefined;
        }

        return new OTLPTraceExporter({ url: config.exporter.url, headers: {} });
    }

    private getLoggerProcessors(config?: OTELLogsConfig): LogRecordProcessor[] {
        if (!ObjectUtils.isEnabled(config)) {
            return [];
        }

        return [
            new BatchLogRecordProcessor({
                exporter: new OTLPLogExporter({ url: config.exporter.url, headers: {} })
            })
        ];
    }

    private isEnabled(config?: OTELConfig): config is OTELConfig {
        if (CommonUtils.isNil(config)) {
            return false;
        }

        return ObjectUtils.isEnabled(config.traces) || ObjectUtils.isEnabled(config.metrics) || ObjectUtils.isEnabled(config.logs);
    }

    private initDebug(config: OTELConfig): void {
        if (config.debug) {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
        }
    }

    /**
     * Installs the `import-in-the-middle` ESM loader hook. Without it only CommonJS
     * `require` is patched and ESM-only dependencies (mongoose via `@tsed/mongoose`,
     * for example) stay uninstrumented.
     */
    private registerInstrumentationHook(): void {
        register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
    }
}

/**
 * The process-wide instance. Bootstrap calls `init()` on it, teardown calls `shutdown()`.
 *
 * `instrument.js` and `index.js` are separate `--import` entry graphs but share one module
 * registry, so both resolve this to the same object — that is how teardown in the app
 * entrypoint reaches an SDK started before the entrypoint ran.
 *
 * Use this rather than constructing one: `new OpenTelemetryService().shutdown()` is a
 * fresh instance with no SDK, so it silently does nothing. The class stays exported for
 * tests, which want a throwaway instance per case.
 */
export const openTelemetry = new OpenTelemetryService();
