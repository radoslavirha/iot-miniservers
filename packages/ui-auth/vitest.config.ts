import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(mergeConfig(defaultConfig, {
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test-setup.ts'],
        coverage: {
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80
            }
        }
    }
}));
