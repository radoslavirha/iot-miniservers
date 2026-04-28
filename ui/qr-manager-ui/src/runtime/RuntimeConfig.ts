export interface RuntimeConfig {
    apiBaseURL: string;
    /**
     * Public sub-path the app is mounted at (e.g. `/qr-manager/`).
     * Passed to <BrowserRouter basename> so <Link to="/admin"> generates the
     * correct public URL regardless of where the app is served.
     *
     * Set to "/" when the app has its own host.
     * Set to "/qr-manager/" when served under a path prefix.
     *
     * nginx reads NGINX_BASE_PATH, injects <base href>, AND serves static files
     * under the correct location — all without rebuilding the image.
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
 * Resolves config.json relative to the <base href> element injected by nginx at
 * container start (NGINX_BASE_PATH env var). This is the only reliable runtime
 * approach: <base href> is set to the correct sub-path before any JS runs, so
 * `new URL('config.json', baseHref)` gives the right URL regardless of which
 * route the user is on. Falls back to '/config.json' in dev (Vite dev server,
 * no nginx, no <base> tag).
 */
const resolveConfigUrl = (): string => {
    const baseEl = typeof document !== 'undefined' ? document.querySelector('base') : null;
    if (baseEl?.href) {
        // Sub-path deploy: nginx injected <base href="/qr-manager/">
        return new URL('config.json', baseEl.href).href;
    }
    // No <base> tag — dev (Vite) or root deploy. Serve config.json from origin root.
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    return `${origin}/config.json`;
};

export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
    const url = resolveConfigUrl();
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
            `ensure nginx serves config.json before the catch-all try_files.`,
            { cause }
        );
    }
    return validateRuntimeConfig(raw);
};
