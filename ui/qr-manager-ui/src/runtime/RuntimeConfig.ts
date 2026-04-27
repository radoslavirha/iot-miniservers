export interface RuntimeConfig {
    apiBaseURL: string;
    /**
     * Public sub-path the app is mounted at (e.g. `/qr-manager/`).
     * Passed to <BrowserRouter basename> so <Link to="/admin"> generates the
     * correct public URL regardless of where Traefik exposes the service.
     *
     * Set to "/" when the app has its own host (e.g. qr-ui.home).
     * Set to "/qr-manager/" when Traefik strips /qr-manager before forwarding.
     *
     * Infra rule: nginx always runs at root — Traefik does the prefix strip.
     *
     * @default "/"
     */
    basePath: string;
}

const REQUIRED_KEYS: Array<keyof RuntimeConfig> = ['apiBaseURL'];

export const validateRuntimeConfig = (raw: unknown): RuntimeConfig => {
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Runtime config must be a JSON object.');
    }
    const candidate = raw as Record<string, unknown>;
    for (const key of REQUIRED_KEYS) {
        if (typeof candidate[key] !== 'string' || (candidate[key] as string).length === 0) {
            throw new Error(`Runtime config is missing required string field "${key}".`);
        }
    }
    const rawBasePath = typeof candidate.basePath === 'string' ? candidate.basePath : '/';
    return {
        apiBaseURL: stripTrailingSlash(candidate.apiBaseURL as string),
        basePath: ensureLeadingSlash(rawBasePath)
    };
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');
const ensureLeadingSlash = (value: string): string => value.startsWith('/') ? value : `/${value}`;

/**
 * Fetches `/config.json` at the nginx root. Always an absolute path so it
 * resolves correctly regardless of which sub-page the browser is currently on.
 * Traefik strips the prefix before reaching nginx, so nginx always serves from
 * `/`. Always served fresh so a Kubernetes ConfigMap rollover is picked up on
 * the next page load.
 */
export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
    const url = '/config.json';
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load runtime config from ${url} (${response.status}).`);
    }
    let raw: unknown;
    try {
        raw = await response.json();
    } catch (cause) {
        throw new Error(
            `Runtime config at ${url} is not valid JSON. Likely an SPA fallback returning HTML — ` +
            `ensure nginx serves /config.json before the catch-all try_files.`,
            { cause }
        );
    }
    return validateRuntimeConfig(raw);
};
