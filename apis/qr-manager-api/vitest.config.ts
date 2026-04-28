import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    oxc: false,
    test: {
        globalSetup: [import.meta.resolve('@tsed/testcontainers-mongo/vitest/setup')],
        coverage: {
            exclude: [
                'src/models/**',
                'src/otel/**',
                'src/controllers/**',
                'src/storage/**/dto/**',
                'src/index.ts',
                'src/Server.ts'
            ]
        }
    }
}));
