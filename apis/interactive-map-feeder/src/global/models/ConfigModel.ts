import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import z from 'zod';

export const ConfigSchema = BaseConfig.extend({
    logger: LoggerOptionsSchema
});
export type ConfigModel = z.infer<typeof ConfigSchema>;