import { z } from 'zod';
import { httpUrl, loadRuntimeConfig } from '@radoslavirha/ui-runtime';

/**
 * The dashboard's runtime configuration contract.
 *
 * Single source of truth: Vite bundles it for the browser, and esbuild bundles
 * it into the homelab-dashboard-ui-config-validator image the chart runs as an
 * initContainer before nginx starts.
 */
export const AppConfigSchema = z.object({
    title: z.string().optional(),
    unifi: z.object({
        /**
         * Absolute URL — nginx proxy_passes to it, and the entrypoint derives
         * UNIFI_HOST from this exact value.
         */
        host: httpUrl(),
        /**
         * Rendered from the homelab-dashboard-ui-unifi-credentials secret. The
         * old entrypoint checked only `host`, so an empty substitution here
         * booted a pod where every Unifi request 401s.
         */
        apiKey: z.string().min(1),
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
