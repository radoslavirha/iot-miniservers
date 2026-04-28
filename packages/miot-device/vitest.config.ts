import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    oxc: false,
    test: {
        coverage: {
            thresholds: {
                branches: 94.11,
                functions: 91.07,
                lines: 95,
                statements: 95
            }
        }
    }
}));
