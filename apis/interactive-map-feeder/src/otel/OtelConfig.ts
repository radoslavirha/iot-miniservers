import { OtelConfigSchema } from '@radoslavirha/otel';
import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { type z } from 'zod';

export const ConfigSchema = BaseConfig.extend({
    otel: OtelConfigSchema.optional()
});

export type ConfigModel = z.infer<typeof ConfigSchema>;
