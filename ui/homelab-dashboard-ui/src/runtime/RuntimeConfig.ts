import type { AppConfig } from '../types.js';

export type { AppConfig };

/**
 * Resolves config.json relative to document origin. Falls back to
 * '/config.json' for development (Vite dev server, no nginx).
 */
const resolveConfigUrl = (): string => {
    if (typeof window !== 'undefined') {
        return `${window.location.origin}/config.json`;
    }
    return '/config.json';
};

const validateConfig = (cfg: AppConfig): AppConfig => {
    if (!cfg.unifi?.host) throw new Error('config.json: unifi.host is required.');
    if (!cfg.unifi?.apiKey) throw new Error('config.json: unifi.apiKey is required.');
    return cfg;
};

/**
 * Fetches /config.json with no-cache so a k8s ConfigMap update is picked up
 * on the next page load without a CDN bust. Throws a descriptive Error if the
 * file is missing or malformed — the error is caught in main.tsx before React
 * mounts.
 */
export const loadRuntimeConfig = async (): Promise<AppConfig> => {
    const url = resolveConfigUrl();

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store' });
    } catch (e) {
        throw new Error(`Network error loading config.json: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!res.ok) {
        throw new Error(
            `config.json not found (HTTP ${res.status}). ` +
            `Create public/config.json or mount it as a ConfigMap at ` +
            `/usr/share/nginx/html/config.json.`
        );
    }

    let cfg: unknown;
    try {
        cfg = await res.json();
    } catch {
        throw new Error('config.json is not valid JSON.');
    }

    return validateConfig(cfg as AppConfig);
};
