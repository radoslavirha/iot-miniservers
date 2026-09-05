import { z } from 'zod';
import { AuthConfigSchema } from '@radoslavirha/ui-auth';
import { absolutePath, httpUrl, loadRuntimeConfig, stripTrailingSlash } from '@radoslavirha/ui-runtime';

/**
 * The app's runtime configuration contract.
 *
 * This schema is the single source of truth: Vite bundles it for the browser,
 * and esbuild bundles it into the qr-manager-ui-config-validator image that the
 * chart runs as an initContainer before nginx starts. A config that reaches the
 * browser has already been accepted by these exact rules.
 */
export const RuntimeConfigSchema = z.object({
    /**
     * Base URL of qr-manager-api.
     *
     * `httpUrl()` rather than `z.url()`: the latter accepts "localhost:4002",
     * parsing it as protocol `localhost:`.
     */
    apiBaseURL: httpUrl().transform(stripTrailingSlash),
    /**
     * Public sub-path the app is mounted at (e.g. `/qr-manager`).
     * Passed to <BrowserRouter basename> so <Link to="/admin"> generates the
     * correct public URL regardless of where the app is served.
     *
     * Set to "/" when the app has its own host.
     * Set to "/qr-manager" when served under a path prefix.
     *
     * nginx reads NGINX_BASE_PATH, injects <base href>, AND serves static files
     * under the correct location — all without rebuilding the image.
     */
    basePath: absolutePath().default('/'),
    /**
     * IdP settings. REQUIRED — the validating initContainer rejects a config
     * without it, so a UI can never quietly ship with login switched off.
     * Nothing here is secret; a public client has no secret to hide.
     */
    auth: AuthConfigSchema
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const loadConfig = (): Promise<RuntimeConfig> =>
    loadRuntimeConfig({ schema: RuntimeConfigSchema });
