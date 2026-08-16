import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    oxc: false,
    test: {
        coverage: {
            exclude: ['src/models/**'],
            thresholds: {
                lines: 29.4,
                functions: 26.5,
                statements: 28.3,
                branches: 20.5
            }
        }
    }
}));
