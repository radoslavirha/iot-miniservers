import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { createExternalApisSchema } from '@radoslavirha/tsed-http-provider';
import { HealthConfigSchema } from '@radoslavirha/tsed-health';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '@radoslavirha/otel';
import z from 'zod';
import { ExternalApi } from './ExternalApi.enum.js';

export const ConfigSchema = BaseConfig.extend({
    externalApis: createExternalApisSchema(Object.values(ExternalApi))
        .describe('External APIs this service calls — base URL, auth, resilience and logging per API.'),
    // Every field is defaulted, so omitting `health` entirely is valid — additive, and
    // safe for a rolling deploy where an old pod reads a new ConfigMap or vice versa.
    health: HealthConfigSchema.optional().describe('Health endpoint configuration.'),
    logger: LoggerOptionsSchema.optional(),
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.')
});
export type ConfigModel = z.infer<typeof ConfigSchema>;
