import { BaseConfig } from '@radoslavirha/tsed-configuration';
import z from 'zod';

export const ConfigSchema = BaseConfig;
export type ConfigModel = z.infer<typeof ConfigSchema>;