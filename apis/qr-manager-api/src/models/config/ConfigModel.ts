import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { z } from 'zod';
import { MongoConfigSchema } from '@radoslavirha/tsed-mongoose';
import { HealthConfigSchema } from '@radoslavirha/tsed-health';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '@radoslavirha/otel';
import { RedirectConfigSchema } from './RedirectConfig.js';

export const ConfigSchema = BaseConfig.extend({
    mongodb: MongoConfigSchema.describe('MongoDB configuration. The QR Manager always persists records to MongoDB.'),
    redirect: RedirectConfigSchema.describe('Public redirect configuration.'),
    // Every field is defaulted, so omitting `health` entirely is valid — additive, and
    // safe for a rolling deploy where an old pod reads a new ConfigMap or vice versa.
    health: HealthConfigSchema.optional().describe('Health endpoint configuration.'),
    logger: LoggerOptionsSchema.optional(),
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.')
});

export type ConfigModel = z.infer<typeof ConfigSchema>;
