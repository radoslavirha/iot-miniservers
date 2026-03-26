/**
 * OpenTelemetry SDK bootstrap.
 * Must be loaded before the main entrypoint via Node.js --import flag:
 *   node --import ./dist/otel/instrument.js dist/index.js
 *
 * Reads OTEL configuration from the JSON config file (same source as the rest of the
 * application) without starting the Ts.ED DI container or importing any instrumented
 * libraries (express, http, mongoose).
 */
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { diag, DiagConsoleLogger, DiagLogLevel, metrics } from '@opentelemetry/api';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { type SpanExporter } from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, type LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { ConfigProvider } from '@radoslavirha/tsed-configuration';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { ConfigSchema, ConfigModel, OTELConfig, OTELTracesConfig, OTELMetricsConfig, OTELLogsConfig } from './OtelConfig.js';

export class OpenTelemetryService {
    public init() {
        const configProvider = new ConfigProvider<ConfigModel>({ schema: ConfigSchema });
        const config = configProvider.config.otel;

        if (!this.isEnabled(config)) {
            return;
        }

        this.initDebug(config);
        this.initSDK(
            config,
            configProvider.api.service,
            configProvider.api.version
        );
    }

    private initSDK(config: OTELConfig, serviceName: string, serviceVersion: string): void {
        const sdk = new NodeSDK({
            resource: resourceFromAttributes({
                [ATTR_SERVICE_NAME]: serviceName,
                [ATTR_SERVICE_VERSION]: serviceVersion
            }),
            traceExporter: this.getTraceExporter(config.traces),
            metricReaders: this.getMetricReader(config.metrics),
            logRecordProcessors: this.getLoggerProcessors(config.logs),
            instrumentations: [
                new HttpInstrumentation({
                    enabled: ObjectUtils.isEnabled(config.traces)
                }),
                new ExpressInstrumentation({
                    enabled: ObjectUtils.isEnabled(config.traces)
                }),
                new WinstonInstrumentation({
                    enabled: ObjectUtils.isEnabled(config.traces),
                    disableLogSending: !ObjectUtils.isEnabled(config.logs)
                })
            ]
        });

        sdk.start();

        if (ObjectUtils.isEnabled(config.metrics)) {
            this.appendMetrics();
        }
    }

    private appendMetrics(): void {
        const hostMetrics = new HostMetrics({
            meterProvider: metrics.getMeterProvider()
        });
        hostMetrics.start();
    }

    private getMetricReader(config?: OTELMetricsConfig): PeriodicExportingMetricReader[] | undefined {
        if (!ObjectUtils.isEnabled(config)) {
            return undefined;
        }

        const reader = new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
                url: config.exporter.url,
                headers: {}
            })
        });

        return [reader];
    }

    private getTraceExporter(config?: OTELTracesConfig): SpanExporter | undefined {
        if (!ObjectUtils.isEnabled(config)) {
            return undefined;
        }

        return new OTLPTraceExporter({
            url: config.exporter.url,
            headers: {}
        });
    }

    private getLoggerProcessors(config?: OTELLogsConfig): LogRecordProcessor[] {
        const processors: LogRecordProcessor[] = [];
       
        if (!ObjectUtils.isEnabled(config)) {
            return processors;
        }
        
        const exporter = new OTLPLogExporter({
            url: config.exporter.url,
            headers: {}
        });

        processors.push(new BatchLogRecordProcessor(exporter));
        
        return processors;
    }

    private isEnabled(config?: OTELConfig): config is OTELConfig {
        if (CommonUtils.isNil(config)) {
            return false;
        }
        return ObjectUtils.isEnabled(config.traces) || ObjectUtils.isEnabled(config.metrics) || ObjectUtils.isEnabled(config.logs);
    }

    private initDebug(config?: OTELConfig): void {
        if (config?.debug) {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
        }
    }
}

new OpenTelemetryService().init();
