import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' → relative asset paths in built HTML. nginx injects <base href>
// from NGINX_BASE_PATH env var at container start, so assets and config.json
// resolve correctly from any sub-path without rebuilding the image.
export default defineConfig({
    base: './',
    plugins: [react()],
    build: {
        // public/ holds ONLY config.json — the development runtime config. It
        // must never reach dist/, because dist/ becomes the nginx html root:
        // a ConfigMap that fails to mount would then be invisible, with the pod
        // serving localhost defaults while passing validation and /healthz.
        // The dev server still serves public/, so `pnpm dev` is unaffected.
        copyPublicDir: false
    },
    server: {
        port: 5173
    }
});
