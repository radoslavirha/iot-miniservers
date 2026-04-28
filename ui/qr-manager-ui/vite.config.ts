import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' → relative asset paths in built HTML. nginx injects <base href>
// from NGINX_BASE_PATH env var at container start, so assets and config.json
// resolve correctly from any sub-path without rebuilding the image.
export default defineConfig({
    base: './',
    plugins: [react()],
    server: {
        port: 5173
    }
});
