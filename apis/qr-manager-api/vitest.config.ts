import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    oxc: false,
    test: {
        coverage: {
            // Models, OTel bootstrap, controllers (decorator wiring), Mongo repository (needs a live DB)
            // and DTO classes are excluded — covered by integration tests against a real Mongo instance,
            // not by these unit tests.
            exclude: [
                'src/models/**',
                'src/otel/**',
                'src/controllers/**',
                'src/storage/**',
                'src/index.ts',
                'src/Server.ts'
            ]
        }
    }
}));
