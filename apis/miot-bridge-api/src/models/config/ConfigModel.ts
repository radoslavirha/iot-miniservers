import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { createExternalApisSchema } from '@radoslavirha/tsed-http-provider';
import { z } from 'zod';
import { ExternalApi } from './ExternalApi.enum.js';
import { HttpConfigSchema } from './HttpConfig.js';
import { HealthConfigSchema } from '@radoslavirha/tsed-health';
import { MongoConfigSchema } from '@radoslavirha/tsed-mongoose';
import { MqttConfigSchema } from './MqttConfig.js';
import { PollingConfigSchema } from './PollingConfig.js';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '@radoslavirha/otel';
// From `@radoslavirha/auth`, not the Ts.ED wrapper that re-exports it. The
// wrapper's barrel also carries `AuthenticationService`, whose `@Injectable()`
// runs on import — so importing a pure schema factory from there registers a DI
// provider that every unit test then has to satisfy, and the failure surfaces as
// an injection error in specs that have nothing to do with authentication.
import { createAuthConfigSchema } from '@radoslavirha/auth';
import { AuthMethod } from './AuthMethod.enum.js';

export const ConfigSchema = BaseConfig.extend({
    cachePath: z.string().optional().describe('Path to the JSON device cache file. Relative to CWD.'),
    mongodb: MongoConfigSchema.optional().describe('MongoDB configuration. When mongodb.enabled is true, MongoDB is used as the device storage.'),
    polling: PollingConfigSchema.optional().describe('Device property polling configuration. When polling.enabled is true, subscribed properties are polled at the configured interval.'),
    http: HttpConfigSchema.optional().describe('HTTP notification configuration.'),
    externalApis: createExternalApisSchema(Object.values(ExternalApi)).describe('External APIs this service calls — base URL, auth, resilience and logging per API.'),
    mqtt: MqttConfigSchema.optional().describe('MQTT client configuration. Connection is shared by the inbound command subscriber and outbound notification publisher.'),
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
     * Not optional, unlike `mqtt`, `udp` and the rest above. Those default to
     * off and a missing block means "this transport is not in use"; a missing
     * `auth` block would mean "this API is open", which is the one default this
     * design refuses to have.
     */
    auth: createAuthConfigSchema(Object.values(AuthMethod)).describe('Authentication configuration.')
});

export type ConfigModel = z.infer<typeof ConfigSchema>;
