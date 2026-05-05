import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test-setup.ts'],
        coverage: {
            enabled: true,
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.spec.{ts,tsx}',
                'src/main.tsx',
                'src/test-setup.ts',
                'src/vite-env.d.ts'
            ],
            thresholds: {
                lines: 70,
                statements: 70,
                functions: 70,
                branches: 70
            }
        }
    }
});
