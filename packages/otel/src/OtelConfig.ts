import { z } from 'zod';

const OtelExporterSchema = z.object({
    url: z.string().describe('OTLP/HTTP exporter endpoint URL.')
});

const OtelTracesConfigSchema = z.union([
    z.object({
        enabled: z.literal(true),
        exporter: OtelExporterSchema.describe('OTLP/HTTP exporter configuration. Required when traces are enabled.')
    }),
    z.object({
        enabled: z.literal(false).optional(),
        exporter: OtelExporterSchema.optional()
    })
]);

const OtelMetricsConfigSchema = z.union([
    z.object({
        enabled: z.literal(true),
        exporter: OtelExporterSchema.describe('OTLP/HTTP exporter configuration. Required when metrics are enabled.')
    }),
    z.object({
        enabled: z.literal(false).optional(),
        exporter: OtelExporterSchema.optional()
    })
]);

const OtelLogsConfigSchema = z.union([
    z.object({
        enabled: z.literal(true),
        exporter: OtelExporterSchema.describe('OTLP/HTTP exporter configuration. Required when logs are enabled.')
    }),
    z.object({
        enabled: z.literal(false).optional(),
        exporter: OtelExporterSchema.optional()
    })
]);

export const OtelConfigSchema = z.object({
    debug: z.boolean().optional().describe('Enable OTEL SDK debug logging via DiagConsoleLogger.'),
    traces: OtelTracesConfigSchema.optional(),
    metrics: OtelMetricsConfigSchema.optional(),
    logs: OtelLogsConfigSchema.optional()
});

export type OTELConfig = z.infer<typeof OtelConfigSchema>;
export type OTELTracesConfig = z.infer<typeof OtelTracesConfigSchema>;
export type OTELMetricsConfig = z.infer<typeof OtelMetricsConfigSchema>;
export type OTELLogsConfig = z.infer<typeof OtelLogsConfigSchema>;
