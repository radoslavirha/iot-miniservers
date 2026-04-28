import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '@radoslavirha/otel';
import z from 'zod';

export const ConfigSchema = BaseConfig.extend({
    logger: LoggerOptionsSchema.optional(),
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.')
});
export type ConfigModel = z.infer<typeof ConfigSchema>;