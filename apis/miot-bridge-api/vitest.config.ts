import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    oxc: false,
    test: {
        coverage: {
            exclude: ['src/models/**'],
            thresholds: {
                lines: 50.9,
                functions: 36.8,
                statements: 49.7,
                branches: 47.6
            }
        }
    }
}));
