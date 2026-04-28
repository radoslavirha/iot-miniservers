import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    oxc: false,
    test: {
        coverage: {
            exclude: ['src/models/**'],
            thresholds: {
                lines: 10.79,
                functions: 17.94,
                statements: 10.41,
                branches: 0
            }
        }
    }
}));