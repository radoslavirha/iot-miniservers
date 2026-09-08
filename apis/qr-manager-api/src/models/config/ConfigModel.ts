import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { z } from 'zod';
import { MongoConfigSchema } from '@radoslavirha/tsed-mongoose';
import { HealthConfigSchema } from '@radoslavirha/tsed-health';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '@radoslavirha/otel';
import { createAuthConfigSchema } from '@radoslavirha/auth';
import { AuthMethod } from './AuthMethod.enum.js';
import { RedirectConfigSchema } from './RedirectConfig.js';

export const ConfigSchema = BaseConfig.extend({
    mongodb: MongoConfigSchema.describe('MongoDB configuration. The QR Manager always persists records to MongoDB.'),
    redirect: RedirectConfigSchema.describe('Public redirect configuration.'),
    // Every field is defaulted, so omitting `health` entirely is valid — additive, and
    // safe for a rolling deploy where an old pod reads a new ConfigMap or vice versa.
    health: HealthConfigSchema.optional().describe('Health endpoint configuration.'),
    logger: LoggerOptionsSchema.optional(),
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.'),
    /**
     * Required, and tied to the methods this API's routes actually ask for.
     *
     * `createAuthConfigSchema` turns each `AuthMethod` into a required key of
     * the block, so a config file that never configured `IDP` fails to parse at
     * boot naming `auth.IDP` — rather than booting healthy and answering 500 on
     * the first `@Authenticate(AuthMethod.Idp)` route. The enum here and the
     * decorators on the controllers are the same enum, which is what makes that
     * check mean anything.
     *
     * Same shape as `externalApis` above: a service-owned enum handed to a
     * factory in a package that knows nothing about these names.
     */
    auth: createAuthConfigSchema(Object.values(AuthMethod)).describe('Authentication configuration.')
});

export type ConfigModel = z.infer<typeof ConfigSchema>;
