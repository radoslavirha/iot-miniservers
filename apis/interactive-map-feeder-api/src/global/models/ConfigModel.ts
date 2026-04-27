import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { ConfigSchema as OtelConfigSchema } from '../../otel/OtelConfig.js';
import z from 'zod';

export const ConfigSchema = BaseConfig.extend({
    logger: LoggerOptionsSchema,
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.')
});
export type ConfigModel = z.infer<typeof ConfigSchema>;