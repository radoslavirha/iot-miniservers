/**
 * Length of the slug embedded in printed QR codes. Kept short so the QR can be
 * physically tiny on a 3D-printed label.
 */
export const SLUG_LENGTH = 4;

/**
 * Alphabet used by the slug generator. Lowercase alphanumeric only — visually
 * unambiguous and URL-safe.
 */
export const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Regex source for the slug format. Reused by the request validator and the
 * handler-level guard.
 */
export const SLUG_PATTERN = `^[a-z0-9]{${SLUG_LENGTH}}$`;

/**
 * Compiled regex for the slug format.
 */
export const SLUG_REGEX = new RegExp(SLUG_PATTERN);

/**
 * Maximum attempts a service will make to insert a record before giving up on
 * collision retries. Small number — the slug space (36^4 ≈ 1.68M) makes a single
 * collision very unlikely with hundreds of records.
 */
export const INSERT_ATTEMPTS = 5;

/**
 * MongoDB duplicate-key error code. Used to detect unique-index collisions for
 * retry decisions.
 */
export const MONGO_DUPLICATE_KEY = 11000;

/**
 * QR image rendering presets.
 *
 * `PRINT_PNG_SIZE` — pixel width used when no explicit `?size=` is provided to
 * the PNG image endpoint.
 *
 * `MIN_PNG_SIZE` / `MAX_PNG_SIZE` — bounds enforced server-side to prevent
 * absurd sizes blowing up memory or producing unscannable images.
 */
export const PRINT_PNG_SIZE = 512;
export const MIN_PNG_SIZE = 64;
export const MAX_PNG_SIZE = 4096;

/**
 * Default error correction level when the caller does not specify one. `M`
 * (~15% damage tolerance) is the sweet spot for protected indoor labels: it
 * keeps the module count low enough to print at small sizes while still
 * tolerating a chip or smudge. Bump to `H` for outdoor / abused labels via
 * the `?ecLevel=` query parameter.
 */
export const DEFAULT_QR_ERROR_CORRECTION = 'M';
