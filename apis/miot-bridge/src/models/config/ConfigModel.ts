import { BaseConfig } from '@radoslavirha/tsed-configuration';
import { z } from 'zod';
import { HttpConfigSchema } from './HttpConfig.js';
import { MongoConfigSchema } from '@radoslavirha/tsed-mongoose';
import { MqttConfigSchema } from './MqttConfig.js';
import { PollingConfigSchema } from './PollingConfig.js';
import { UdpConfigSchema } from './UdpConfig.js';
import { LoggerOptionsSchema } from '@radoslavirha/tsed-logger';
import { OtelConfigSchema } from '../../otel/OtelConfig.js';

export const ConfigSchema = BaseConfig.extend({
    cachePath: z.string().optional().describe('Path to the JSON device cache file. Relative to CWD.'),
    mongodb: MongoConfigSchema.optional().describe('MongoDB configuration. When mongodb.enabled is true, MongoDB is used as the device storage.'),
    udp: UdpConfigSchema.optional().describe('UDP listener configuration. When udp.enabled is true, the server accepts commands over UDP.'),
    polling: PollingConfigSchema.optional().describe('Device property polling configuration. When polling.enabled is true, subscribed properties are polled at the configured interval.'),
    http: HttpConfigSchema.optional().describe('HTTP notification configuration.'),
    mqtt: MqttConfigSchema.optional().describe('MQTT client configuration. Connection is shared by the inbound command subscriber and outbound notification publisher.'),
    logger: LoggerOptionsSchema,
    otel: OtelConfigSchema.optional().describe('OpenTelemetry configuration.')
});

export type ConfigModel = z.infer<typeof ConfigSchema>;
