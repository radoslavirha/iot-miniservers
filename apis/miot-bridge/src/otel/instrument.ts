/**
 * OpenTelemetry SDK bootstrap.
 * Must be loaded before the main entrypoint via Node.js --import flag:
 *   node --import ./dist/otel/instrument.js dist/index.js
 */
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { OpenTelemetryService } from '@radoslavirha/otel';
import { ConfigProvider } from '@radoslavirha/tsed-configuration';
import { type ConfigModel, ConfigSchema } from './OtelConfig.js';

const configProvider = new ConfigProvider<ConfigModel>({ schema: ConfigSchema });

new OpenTelemetryService({
    otel: configProvider.config.otel,
    service: configProvider.api.service,
    version: configProvider.api.version,
    extraInstrumentations: [
        new MongooseInstrumentation()
    ]
}).init();
