import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { createExternalApisSchema } from '@radoslavirha/tsed-http-provider';
import { z } from 'zod';
import { ExternalApi } from './ExternalApi.enum.js';
import { HttpConfigSchema } from './HttpConfig.js';
import { HealthConfigSchema } from '@radoslavirha/tsed-health';
import { MongoConfigSchema } from '@radoslavirha/tsed-mongoose';
import { MqttConfigSchema } from './MqttConfig.js';
import { PollingConfigSchema } from './PollingConfig.js';
import { UdpConfigSchema } from './UdpConfig.js';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '@radoslavirha/otel';

export const ConfigSchema = BaseConfig.extend({
    cachePath: z.string().optional().describe('Path to the JSON device cache file. Relative to CWD.'),
    mongodb: MongoConfigSchema.optional().describe('MongoDB configuration. When mongodb.enabled is true, MongoDB is used as the device storage.'),
    udp: UdpConfigSchema.optional().describe('UDP listener configuration. When udp.enabled is true, the server accepts commands over UDP.'),
    polling: PollingConfigSchema.optional().describe('Device property polling configuration. When polling.enabled is true, subscribed properties are polled at the configured interval.'),
    http: HttpConfigSchema.optional().describe('HTTP notification configuration.'),
    externalApis: createExternalApisSchema(Object.values(ExternalApi)).describe('External APIs this service calls — base URL, auth, resilience and logging per API.'),
    mqtt: MqttConfigSchema.optional().describe('MQTT client configuration. Connection is shared by the inbound command subscriber and outbound notification publisher.'),
    // Every field is defaulted, so omitting `health` entirely is valid — additive, and
    // safe for a rolling deploy where an old pod reads a new ConfigMap or vice versa.
    health: HealthConfigSchema.optional().describe('Health endpoint configuration.'),
    logger: LoggerOptionsSchema.optional(),
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.')
});

export type ConfigModel = z.infer<typeof ConfigSchema>;
