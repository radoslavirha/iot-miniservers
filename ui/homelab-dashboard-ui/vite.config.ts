import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Read Unifi host from public/config.json so the dev-server proxy target
// doesn't need a separate env var. Falls back to localhost Unifi default.
function unifiHost(): string {
    try {
        const cfg = JSON.parse(readFileSync('./public/config.json', 'utf-8')) as {
            unifi?: { host?: string };
        };
        return cfg.unifi?.host ?? 'https://192.168.1.1';
    } catch {
        return 'https://192.168.1.1';
    }
}

const proxy = {
    // Forward all Unifi Network-app paths to the controller.
    // The app always uses relative URLs (/proxy/network/...) so the same
    // fetch code works in dev, preview, and production (nginx proxy_pass).
    '/proxy/network': {
        target: unifiHost(),
        changeOrigin: true,
        secure: false
    }
};

// base './' → relative asset paths in built HTML. nginx serves the app from
// the root path, so no sub-path prefix is needed.
export default defineConfig({
    base: './',
    plugins: [react()],
    server: {
        port: 5174,
        proxy
    },
    preview: { proxy }
});
