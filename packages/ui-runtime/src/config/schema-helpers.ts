import { z } from 'zod';

/**
 * An absolute http(s) URL.
 *
 * Plain `z.url()` is NOT enough: it accepts `"localhost:4002"`, because
 * `new URL("localhost:4002")` parses as protocol `localhost:` with pathname
 * `4002`. That is exactly the typo this rule exists to catch — a base URL
 * missing its scheme reaches the browser and fails later at fetch time with a
 * confusing message.
 *
 * Constraining the protocol also rejects `ftp:` and friends, which nothing here
 * should ever be pointed at.
 */
export const httpUrl = (): z.ZodURL => z.url({ protocol: /^https?$/ });

/** A path that is absolute from the site root, e.g. `/qr-manager`. */
export const absolutePath = (): z.ZodString => z.string().startsWith('/');

/** Drops trailing slashes so callers can concatenate paths without doubling them. */
export const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');
