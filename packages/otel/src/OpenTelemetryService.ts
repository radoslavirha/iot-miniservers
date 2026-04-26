import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag, DiagConsoleLogger, DiagLogLevel, metrics } from '@opentelemetry/api';
import { HostMetrics } from '@opentelemetry/host-metrics';
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
import type { OTELConfig, OTELLogsConfig, OTELMetricsConfig, OTELTracesConfig } from './OtelConfig.js';

export interface OtelBootstrapOptions {
    readonly otel?: OTELConfig;
    readonly service: string;
    readonly version: string;
    readonly extraInstrumentations?: Instrumentation[];
}

export class OpenTelemetryService {
    public constructor(private readonly options: OtelBootstrapOptions) {}

    public init(): void {
        const { otel, service, version, extraInstrumentations = [] } = this.options;

        if (!this.isEnabled(otel)) {
            return;
        }

        this.initDebug(otel);
        this.initSDK(otel, service, version, extraInstrumentations);
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
                new HttpInstrumentation({ enabled: tracesEnabled }),
                new ExpressInstrumentation({ enabled: tracesEnabled }),
                new WinstonInstrumentation({
                    enabled: tracesEnabled,
                    disableLogSending: !logsEnabled
                }),
                ...extraInstrumentations
            ]
        });

        sdk.start();

        if (ObjectUtils.isEnabled(config.metrics)) {
            this.appendHostMetrics();
        }
    }

    private appendHostMetrics(): void {
        const hostMetrics = new HostMetrics({ meterProvider: metrics.getMeterProvider() });
        hostMetrics.start();
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
            new BatchLogRecordProcessor(
                new OTLPLogExporter({ url: config.exporter.url, headers: {} })
            )
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
}
