import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { createExternalApisSchema } from '@radoslavirha/tsed-http-provider';
import { HealthConfigSchema } from '@radoslavirha/tsed-health';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '@radoslavirha/otel';
import z from 'zod';
// From `@radoslavirha/auth`, not the Ts.ED wrapper that re-exports it. The
// wrapper's barrel also carries `AuthenticationService`, whose `@Injectable()`
// runs on import — so importing a pure schema factory from there registers a DI
// provider that every unit test then has to satisfy.
import { createAuthConfigSchema } from '@radoslavirha/auth';
import { AuthMethod } from './AuthMethod.enum.js';
import { ExternalApi } from './ExternalApi.enum.js';

export const ConfigSchema = BaseConfig.extend({
    externalApis: createExternalApisSchema(Object.values(ExternalApi))
        .describe('External APIs this service calls — base URL, auth, resilience and logging per API.'),
    // Every field is defaulted, so omitting `health` entirely is valid — additive, and
    // safe for a rolling deploy where an old pod reads a new ConfigMap or vice versa.
    health: HealthConfigSchema.optional().describe('Health endpoint configuration.'),
    logger: LoggerOptionsSchema.optional(),
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.'),
    /**
     * Required, and tied to the methods this API's routes actually ask for.
     *
     * `createAuthConfigSchema` turns each `AuthMethod` into a required key, so a
     * config that never configured `DEVICE` fails to parse at boot naming
     * `auth.DEVICE` — rather than booting healthy and refusing the map on its
     * first poll, which is a fault nobody would see until the LEDs went dark.
     */
    auth: createAuthConfigSchema(Object.values(AuthMethod)).describe('Authentication configuration.')
});
export type ConfigModel = z.infer<typeof ConfigSchema>;
