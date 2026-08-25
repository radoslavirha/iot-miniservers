import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// base './' → relative asset paths in built HTML. nginx serves the app from
// the root path, so no sub-path prefix is needed.
export default defineConfig(({ mode }) => {
    // UNIFI_HOST and UNIFI_API_KEY come from a gitignored .env.local, never
    // from public/config.json — that file is committed and must never carry a
    // credential again. The third argument is '' so the vars are picked up
    // without a VITE_ prefix: they are for this config, not for the bundle.
    const env = loadEnv(mode, process.cwd(), '');

    const proxy = {
        // Forward all Unifi Network-app paths to the controller.
        // The app always uses relative URLs (/proxy/network/...) so the same
        // fetch code works in dev, preview, and production (nginx proxy_pass).
        '/proxy/network': {
            target: env.UNIFI_HOST ?? 'https://192.168.1.1',
            changeOrigin: true,
            secure: false,
            // Same shape as production: the browser never holds the key, the
            // server-side hop attaches it.
            headers: { 'X-Api-Key': env.UNIFI_API_KEY ?? '' }
        }
    };

    return {
        base: './',
        plugins: [react()],
        build: {
            // public/ holds ONLY config.json and config.example.json —
            // development runtime config. Neither must reach dist/, because
            // dist/ becomes the nginx html root: a ConfigMap that fails to
            // mount would then be invisible, with the pod serving the
            // development file while passing validation and /healthz.
            // The dev server still serves public/, so `pnpm dev` is unaffected.
            copyPublicDir: false
        },
        server: {
            port: 5174,
            proxy
        },
        preview: { proxy }
    };
});
