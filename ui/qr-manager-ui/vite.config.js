import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Base path is read at build time from VITE_BASE_PATH so the same image can be
// mounted at `/` (own host) or under `/qr/admin` behind a reverse proxy.
export default defineConfig({
    base: process.env.VITE_BASE_PATH ?? '/',
    plugins: [react()],
    server: {
        port: 5173
    }
});
