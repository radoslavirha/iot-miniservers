import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Always build with base '/'. Sub-path mounting is handled at the infra level:
// Traefik strips the prefix before forwarding to nginx, which serves at root.
// The runtime basePath for BrowserRouter comes from config.json (ConfigMap).
export default defineConfig({
    base: '/',
    plugins: [react()],
    server: {
        port: 5173
    }
});
