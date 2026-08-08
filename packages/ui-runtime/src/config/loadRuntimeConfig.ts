import { prettifyError } from 'zod';
import type { ZodType } from 'zod';
import { RuntimeConfigError } from './errors.js';

export interface LoadRuntimeConfigOptions<T> {
    /**
     * The app's schema. The same object is compiled into the validating
     * initContainer, so the browser and the pod enforce identical rules.
     */
    readonly schema: ZodType<T>;
    /** Override for tests. Defaults to the <base href>-aware resolver. */
    readonly url?: string;
}

/**
 * Resolves config.json against the `<base href>` element nginx injects at
 * container start (from NGINX_BASE_PATH).
 *
 * This is the only reliable runtime approach for a sub-path deploy: `<base>` is
 * set before any JS runs, so `new URL('config.json', baseHref)` is correct no
 * matter which client-side route the user landed on. Falls back to the origin
 * root when there is no `<base>` tag — dev (Vite) or a root-mounted deploy.
 */
const resolveConfigUrl = (): string => {
    const baseEl = typeof document !== 'undefined' ? document.querySelector('base') : null;
    if (baseEl?.href) {
        return new URL('config.json', baseEl.href).href;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    return `${origin}/config.json`;
};

/**
 * Fetches and validates the runtime config.
 *
 * `cache: 'no-store'` so a ConfigMap change takes effect on the next page load
 * rather than waiting out a cache entry.
 *
 * @throws {RuntimeConfigError} carrying a `reason` the caller can branch on.
 */
export const loadRuntimeConfig = async <T>(options: LoadRuntimeConfigOptions<T>): Promise<T> => {
    const url = options.url ?? resolveConfigUrl();

    let response: Response;
    try {
        response = await fetch(url, { cache: 'no-store' });
    } catch (cause) {
        throw new RuntimeConfigError(
            'network',
            `Could not reach ${url} to load the runtime config.`,
            { cause }
        );
    }

    if (!response.ok) {
        throw new RuntimeConfigError(
            'not-found',
            `Runtime config was not served from ${url} (HTTP ${response.status}).`
        );
    }

    let raw: unknown;
    try {
        raw = await response.json();
    } catch (cause) {
        throw new RuntimeConfigError(
            'not-json',
            `Runtime config at ${url} is not valid JSON. Likely an SPA fallback returning ` +
            `HTML — ensure nginx serves config.json before the catch-all try_files.`,
            { cause }
        );
    }

    const result = options.schema.safeParse(raw);
    if (!result.success) {
        // prettifyError is what the validating initContainer prints too, so an
        // operator reading pod logs and a developer reading the browser see the
        // same text for the same fault.
        throw new RuntimeConfigError('invalid', prettifyError(result.error));
    }

    return result.data;
};
