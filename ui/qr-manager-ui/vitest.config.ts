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
            // Pages are page-level orchestration glue around the api/ client (covered) and
            // components (covered). Their behaviour is exercised by App.spec.tsx + manual run.
            exclude: [
                'src/**/*.spec.{ts,tsx}',
                'src/main.tsx',
                'src/test-setup.ts',
                'src/vite-env.d.ts',
                'src/pages/**'
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
