import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    oxc: false,
    test: {
        coverage: {
            exclude: ['src/models/**'],
            thresholds: {
                lines: 16.93,
                functions: 16.93,
                statements: 16.2,
                branches: 4.58
            }
        }
    }
}));
