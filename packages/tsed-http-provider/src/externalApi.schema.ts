import { HttpProviderEntrySchema } from '@radoslavirha/http-provider';
import { z } from 'zod';
import { HttpLogConfigSchema } from './logging.schema.js';

/**
 * A configured external API: everything `@radoslavirha/http-provider` needs
 * (base URL, auth, resilience, retriable statuses) plus the outbound logging
 * this package layers on top.
 *
 * The core package deliberately knows nothing about logging, so the `logging`
 * section is added here rather than there.
 */
export const ExternalApiEntrySchema = HttpProviderEntrySchema.extend({
    logging: HttpLogConfigSchema
});

/**
 * Builds a schema for an `externalApis` map constrained to the given enum keys,
 * so an unknown key fails at config load rather than at first call.
 *
 * @example
 * ```ts
 * enum ExternalApi { MiotSpec = 'miot-spec' }
 *
 * export const ConfigSchema = BaseConfig.extend({
 *   externalApis: createExternalApisSchema(Object.values(ExternalApi)).optional()
 * });
 * ```
 */
export function createExternalApisSchema<K extends string>(
    keys: K[]
): z.ZodObject<Record<K, typeof ExternalApiEntrySchema>> {
    const shape = Object.fromEntries(
        keys.map((key) => [key, ExternalApiEntrySchema])
    ) as Record<K, typeof ExternalApiEntrySchema>;

    return z.object(shape);
}

/** Config as authored — defaulted fields may be omitted. */
export type ExternalApiEntry = z.input<typeof ExternalApiEntrySchema>;

/** Config as parsed — every defaulted field resolved. */
export type ResolvedExternalApiEntry = z.output<typeof ExternalApiEntrySchema>;
