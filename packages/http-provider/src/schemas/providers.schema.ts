import { z } from 'zod';
import { HttpProviderEntrySchema } from './provider.schema.js';

/**
 * A fully open record schema — any string key maps to an HttpProviderEntry.
 * Use this when you don't need key-level type safety at the config layer.
 */
export const HttpProvidersConfigSchema = z.record(z.string(), HttpProviderEntrySchema);

/**
 * Creates a Zod schema for a providers map constrained to the given enum keys.
 * Use this to tie the Zod schema to your project-specific enum so that
 * `z.infer<typeof ProvidersSchema>` produces `Record<YourApiKey, HttpProviderEntry>`.
 *
 * @example
 * ```ts
 * enum ApiKey { QRManager = 'qr-manager', MiotSpec = 'miot-spec' }
 * const ProvidersSchema = createProvidersSchema(Object.values(ApiKey));
 * const ConfigSchema = BaseConfig.extend({
 *   http: z.object({ providers: ProvidersSchema }).optional()
 * });
 * ```
 */
export function createProvidersSchema<K extends string>(keys: K[]): z.ZodObject<Record<K, typeof HttpProviderEntrySchema>> {
    const shape = Object.fromEntries(
        keys.map(k => [k, HttpProviderEntrySchema])
    ) as Record<K, typeof HttpProviderEntrySchema>;
    return z.object(shape);
}

export type HttpProvidersConfig = z.infer<typeof HttpProvidersConfigSchema>;
