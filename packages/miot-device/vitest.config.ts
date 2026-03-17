import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(mergeConfig(defaultConfig, {
    test: {
        coverage: {
            thresholds: {
                branches: 94.44,
                functions: 95,
                lines: 95,
                statements: 95
            }
        }
    }
}));
