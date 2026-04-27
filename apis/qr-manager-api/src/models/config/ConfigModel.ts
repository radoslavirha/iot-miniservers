import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { z } from 'zod';
import { MongoConfigSchema } from '@radoslavirha/tsed-mongoose';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '../../otel/OtelConfig.js';
import { RedirectConfigSchema } from './RedirectConfig.js';

export const ConfigSchema = BaseConfig.extend({
    mongodb: MongoConfigSchema.describe('MongoDB configuration. The QR Manager always persists records to MongoDB.'),
    redirect: RedirectConfigSchema.describe('Public redirect configuration.'),
    logger: LoggerOptionsSchema,
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.')
});

export type ConfigModel = z.infer<typeof ConfigSchema>;
