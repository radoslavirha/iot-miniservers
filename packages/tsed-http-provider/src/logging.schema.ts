import { createRedactionSchema } from '@radoslavirha/redaction';
import { z } from 'zod';

/**
 * Headers redacted by default. Unlike inbound logging, an outbound request
 * carries credentials **this package itself injected** via the auth strategy, so
 * the safe default is to censor them rather than start from an empty list.
 *
 * `fast-redact` rejects hyphens in bare paths — hyphenated header names must use
 * bracket notation.
 */
export const DEFAULT_HEADER_REDACT_PATHS = [
    'authorization',
    'Authorization',
    'cookie',
    'Cookie',
    '["set-cookie"]',
    '["proxy-authorization"]'
];

/**
 * Redactable sections of an outbound exchange, with their default selectors.
 * Built on the shared `{ enabled, redactPaths }` vocabulary from
 * `@radoslavirha/redaction`, so outbound logging is configured exactly like the
 * inbound `logger.requests` section.
 */
const HttpLogSectionsSchema = createRedactionSchema({
    headers: DEFAULT_HEADER_REDACT_PATHS,
    query: [],
    request: [],
    response: []
});

/**
 * Outbound HTTP logging options. Metadata-only by default; payload sections are
 * opt-in. Values are redacted before reaching the logger.
 */
export const HttpLogConfigSchema = HttpLogSectionsSchema.extend({
    /** Disable outbound request/response logging entirely. */
    enabled: z.boolean().default(true),
    /** Include the error stack on failed requests. */
    stack: z.boolean().default(false)
}).default(() => ({
    enabled: true,
    headers: { enabled: false, redactPaths: [] },
    query: { enabled: false, redactPaths: [] },
    request: { enabled: false, redactPaths: [] },
    response: { enabled: false, redactPaths: [] },
    stack: false
}));

export type HttpLogConfig = z.input<typeof HttpLogConfigSchema>;
export type ResolvedHttpLogConfig = z.output<typeof HttpLogConfigSchema>;
