import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    oxc: false,
    test: {
        setupFiles: ['./src/test/setup.ts'],
        // Spins a real MongoDB for the Mongo check's integration spec. Mocking `readyState`
        // proves the mapping table but assumes the premise the whole design rests on —
        // that it actually drops on a real disconnect. That is mongoose's behaviour, so it
        // needs a real connection.
        globalSetup: [import.meta.resolve('@tsed/testcontainers-mongo/vitest/setup')],
        coverage: {
            exclude: ['src/test/**'],
            thresholds: {
                branches: 90,
                functions: 90,
                lines: 90,
                statements: 90
            }
        }
    }
}));
