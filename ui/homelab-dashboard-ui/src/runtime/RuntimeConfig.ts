import { z } from 'zod';
import { loadRuntimeConfig } from '@radoslavirha/ui-runtime';

/**
 * The dashboard's runtime configuration contract.
 *
 * Single source of truth: Vite bundles it for the browser, and esbuild bundles
 * it into the homelab-dashboard-ui-config-validator image the chart runs as an
 * initContainer before nginx starts.
 */
export const AppConfigSchema = z.object({
    title: z.string().optional(),
    /**
     * `host` and `apiKey` deliberately do NOT live here. config.json is served
     * to the browser, so anything in it is public; both moved to the UNIFI_HOST
     * and SECRET_UNIFI_API_KEY env vars, which nginx consumes server-side.
     * Zod strips unknown keys, so a ConfigMap still carrying the old fields
     * parses fine — the image works against either config shape.
     */
    unifi: z.object({
        /** Path segment only, not a secret. */
        site: z.string().min(1).default('default')
    }),
    /** Capture group 1 must be the numeric server index. */
    serverPattern: z.string()
        .refine(
            value => {
                try {
                    // parseDns.ts compiles this; a malformed pattern currently
                    // throws mid-render instead of failing the config.
                    new RegExp(value);
                    return true;
                } catch {
                    return false;
                }
            },
            { error: 'must be a valid regular expression' }
        )
        .default('^server(\\d+)\\.home$'),
    /** Protocol used when building tile URLs from hostnames. */
    scheme: z.enum(['http', 'https']).default('http'),
    /** Hostnames to hide, matched against the full DNS key, case-insensitive. */
    exclude: z.array(z.string()).default([]),
    /** Path suffixes appended to tile URLs, keyed by hostname or service name. */
    paths: z.record(z.string(), z.string()).default({})
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const loadConfig = (): Promise<AppConfig> =>
    loadRuntimeConfig({ schema: AppConfigSchema });
